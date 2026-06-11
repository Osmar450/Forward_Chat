const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Cargar variables de entorno
dotenv.config();

const app = express();
app.use(cors()); // Permitir conexiones desde Vite

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' },
    maxHttpBufferSize: 10e6
});

// ==========================================
// PERSISTENCIA EN DISCO (data/store.json)
// La app es "sostenible": usuarios, amistades,
// lobby y DMs sobreviven a los reinicios.
// ==========================================
const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

const store = {
    users: {},        // userId -> { userId, friendCode, name, avatar, color, banner, bio, status, createdAt }
    friendships: [],  // [ [userIdA, userIdB], ... ]
    lobby: [],        // mensajes del lobby público
    dms: {}           // dmKey -> mensajes privados
};

function loadStore() {
    try {
        if (fs.existsSync(STORE_FILE)) {
            const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
            Object.assign(store, {
                users: raw.users || {},
                friendships: raw.friendships || [],
                lobby: raw.lobby || [],
                dms: raw.dms || {}
            });
            console.log(`💾 Datos cargados: ${Object.keys(store.users).length} usuarios, ${store.lobby.length} mensajes de lobby`);
        }
    } catch (e) {
        console.error('⚠️ No se pudo cargar store.json:', e.message);
    }
}

let saveTimer = null;
function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        try {
            if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
            fs.writeFileSync(STORE_FILE, JSON.stringify(store));
        } catch (e) {
            console.error('⚠️ No se pudo guardar store.json:', e.message);
        }
    }, 3000);
}

loadStore();

// ==========================================
// FRIEND TOKEN: identificador único que simula
// ser un "número" (formato FWD-XXXX-XXXX)
// ==========================================
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin caracteres ambiguos (0/O, 1/I)

function generateFriendCode() {
    const block = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    let code;
    do {
        code = `FWD-${block()}-${block()}`;
    } while (Object.values(store.users).some(u => u.friendCode === code));
    return code;
}

function normalizeCode(input) {
    if (!input) return '';
    const clean = String(input).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const body = clean.startsWith('FWD') ? clean.slice(3) : clean;
    if (body.length !== 8) return '';
    return `FWD-${body.slice(0, 4)}-${body.slice(4)}`;
}

const MAX_DATAURL_LENGTH = 2_000_000; // ~1.5MB en base64; evita perfiles gigantes

function sanitizeMedia(value) {
    if (typeof value !== 'string') return null;
    if (value.length > MAX_DATAURL_LENGTH) return null;
    return value;
}

function getOrCreateUser(userId) {
    if (!store.users[userId]) {
        store.users[userId] = {
            userId,
            friendCode: generateFriendCode(),
            name: userId,
            avatar: null,
            color: null,
            banner: null,
            bannerColor: null,
            bio: '',
            status: 'online',
            createdAt: Date.now()
        };
        scheduleSave();
    }
    return store.users[userId];
}

function publicProfile(user, isOnline) {
    const status = isOnline ? (user.status === 'invisible' ? 'offline' : (user.status || 'online')) : 'offline';
    return {
        userId: user.userId,
        name: user.name,
        avatar: user.avatar,
        color: user.color,
        banner: user.banner,
        bannerColor: user.bannerColor,
        bio: user.bio || '',
        status,
        isBot: false
    };
}

const BOT_ID = 'forwardbot';
const BOT_PROFILE = {
    userId: BOT_ID,
    name: 'ForwardBot',
    avatar: '/assets/Forwardbot_profile.svg',
    color: '#8B5CF6',
    banner: null,
    bannerColor: '#8B5CF6',
    bio: 'Asistente de IA de Forward_Chat. Menciona @ForwardBot en el lobby o escríbeme por privado.',
    status: 'online',
    isBot: true
};

// ==========================================
// AMISTADES Y DMs
// ==========================================
const dmKey = (a, b) => [a, b].sort().join('|');

function areFriends(a, b) {
    return store.friendships.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

function friendIdsOf(userId) {
    return store.friendships
        .filter(([x, y]) => x === userId || y === userId)
        .map(([x, y]) => (x === userId ? y : x));
}

// ==========================================
// CONFIGURACIÓN DE GEMINI / FORWARDBOT
// ==========================================
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

const botPersona = `Tu nombre es ForwardBot. Eres un asistente de IA exclusivo de la aplicación Forward_Chat. Tienes una personalidad dual que debes adaptar según el contexto:

1. MODO RELAJADO (Charlas normales y saludos): Eres muy "cool", sarcástico y de barrio. Usa modismos mexicanos y frases como "whatsup my n", "¡Qué onda broski!", "Hola Papu", "¡Qué rollo cabroncito!" o "wey".
2. MODO SERIO (Ciencia, historia, lógica, programación, temas profundos): Cuando el usuario pregunte sobre estos temas, CAMBIA INMEDIATAMENTE a un tono serio, respetuoso y profesional. NO abuses de modismos ni uses tecnicismos excesivos; explica las cosas de forma clara, objetiva y fácil de entender.

REGLA DE LONGITUD:
- Saludos, chistes o preguntas simples (sí/no): Responde de forma EXTREMADAMENTE CORTA (1 o 2 líneas máximo).
- Explicaciones de historia, ciencia o resolución de problemas: Da una respuesta LARGA, completa, estructurada y educativa.

Si te preguntan quién eres, di que eres el mismísimo ForwardBot.`;

const availableModels = [
    {
        name: 'gemini-3.1-flash-lite',
        model: genAI ? genAI.getGenerativeModel({
            model: 'gemini-3.1-flash-lite',
            systemInstruction: botPersona,
            generationConfig: { maxOutputTokens: 500 }
        }) : null,
        priority: 1
    },
    {
        name: 'gemini-2.5-flash',
        model: genAI ? genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: botPersona,
            generationConfig: { maxOutputTokens: 1500 }
        }) : null,
        priority: 2
    }
];

const modelRotation = { rateLimitCooldown: false, lastRotationTime: Date.now() };
const modelMetrics = { imageSuccess: 0, totalRequests: 0 };

function isInCooldown() {
    if (!modelRotation.rateLimitCooldown) return false;
    if (Date.now() - modelRotation.lastRotationTime >= 30000) {
        modelRotation.rateLimitCooldown = false;
        console.log('✅ Cooldown terminado, reanudando operaciones');
        return false;
    }
    return true;
}

function handleRateLimit() {
    modelRotation.rateLimitCooldown = true;
    modelRotation.lastRotationTime = Date.now();
    console.log('⚠️ Rate limit detectado, activando cooldown de 30s');
}

console.log('=== Configuración de ForwardBot ===');
console.log('Gemini API Key configurada:', !!process.env.GEMINI_API_KEY);
console.log('Modelos:', availableModels.map(m => m.name).join(' → '));
console.log('Modelo de Imágenes: imagen-3.0-generate-001');
console.log('================================');

// ==========================================
// UPLOADS
// ==========================================
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB max
    fileFilter: (req, file, cb) => {
        const imageTypes = /jpeg|jpg|png|gif|webp|bmp/;
        const audioTypes = /webm|ogg|mp3|wav|m4a|mpeg|mp4/;
        const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
        const isImage = imageTypes.test(ext) || file.mimetype.startsWith('image/');
        const isAudio = audioTypes.test(ext) || file.mimetype.startsWith('audio/');
        if (isImage || isAudio) return cb(null, true);
        cb(new Error('Tipo de archivo no permitido'));
    }
});

app.use(express.static(path.join(__dirname, 'Frontend', 'dist')));
app.use('/uploads', express.static(uploadsDir));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

const UPLOAD_RATE_LIMITS = new Map();
const MAX_UPLOADS_PER_MINUTE = 6;

app.post('/upload', upload.array('files', 10), (req, res) => {
    const now = Date.now();
    const clientIp = req.ip || req.connection.remoteAddress;
    const uploadRateLimit = UPLOAD_RATE_LIMITS.get(clientIp) || { count: 0, windowStart: now };

    if (now - uploadRateLimit.windowStart > 60000) {
        uploadRateLimit.count = 0;
        uploadRateLimit.windowStart = now;
    }
    if (uploadRateLimit.count >= MAX_UPLOADS_PER_MINUTE) {
        return res.status(429).json({ error: 'Demasiados uploads. Espera un momento.' });
    }
    uploadRateLimit.count++;
    UPLOAD_RATE_LIMITS.set(clientIp, uploadRateLimit);

    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No se subieron archivos' });
    }
    const files = req.files.map(f => ({
        url: '/uploads/' + f.filename,
        type: f.mimetype.startsWith('image/') ? 'image' : 'audio',
        originalName: f.originalname
    }));
    res.json({ files });
});

// ==========================================
// ESTADO EN MEMORIA (presencia / rate limits)
// ==========================================
// Presencia multi-socket: un usuario puede tener varias pestañas abiertas.
// Cada socket se une al room "u:<userId>", así la señalización SIEMPRE llega
// aunque haya reconexiones o sockets viejos (la causa de las llamadas perdidas).
const userSockets = new Map(); // userId -> Set<socketId>
const isOnline = (userId) => userSockets.has(userId);
const userRoom = (userId) => `u:${userId}`;

function addUserSocket(userId, socketId) {
    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId).add(socketId);
}

// Devuelve true si el usuario quedó completamente desconectado
function removeUserSocket(userId, socketId) {
    const set = userSockets.get(userId);
    if (!set) return false;
    set.delete(socketId);
    if (set.size === 0) {
        userSockets.delete(userId);
        return true;
    }
    return false;
}
const messageRateLimits = new Map();
const RATE_LIMIT_WINDOW = 10000;
const MAX_MESSAGES_PER_WINDOW = 12;
let anonymousCounter = Object.keys(store.users).length + 1;

const LOBBY_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 horas
const DM_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
const MAX_DM_MESSAGES = 500;

let msgSeq = 0;
const newMsgId = () => `m${Date.now().toString(36)}${(msgSeq++).toString(36)}`;

const generateAnonymousId = () => {
    let id;
    do {
        id = `anonimo_${anonymousCounter++}`;
    } while (store.users[id]);
    return id;
};

// Limpieza periódica
setInterval(() => {
    const now = Date.now();
    const before = store.lobby.length;
    for (let i = store.lobby.length - 1; i >= 0; i--) {
        if (now - store.lobby[i].timestamp > LOBBY_RETENTION_MS) store.lobby.splice(i, 1);
    }
    for (const key of Object.keys(store.dms)) {
        store.dms[key] = store.dms[key].filter(m => now - m.timestamp <= DM_RETENTION_MS);
        if (store.dms[key].length === 0) delete store.dms[key];
    }
    if (store.lobby.length !== before) scheduleSave();
}, 60 * 60 * 1000);

// Limpiar imágenes antiguas generadas por el bot
setInterval(() => {
    try {
        const files = fs.readdirSync(uploadsDir);
        const now = Date.now();
        files.forEach(file => {
            if (file.startsWith('bot-gen-')) {
                const filepath = path.join(uploadsDir, file);
                if (now - fs.statSync(filepath).mtimeMs > 24 * 60 * 60 * 1000) fs.unlinkSync(filepath);
            }
        });
    } catch (error) {
        console.error('Error limpiando imágenes antiguas:', error);
    }
}, 6 * 60 * 60 * 1000);

// ==========================================
// HELPERS DE EMISIÓN
// ==========================================
function emitToUser(userId, event, payload) {
    io.to(userRoom(userId)).emit(event, payload);
}

function broadcastPresence() {
    const online = [];
    for (const userId of userSockets.keys()) {
        const user = store.users[userId];
        if (user) online.push(publicProfile(user, true));
    }
    online.push({ ...BOT_PROFILE });
    io.emit('users online', online);
}

function sendFriendsList(userId) {
    const friends = friendIdsOf(userId).map(fid => {
        const user = store.users[fid];
        if (!user) return null;
        return publicProfile(user, isOnline(fid));
    }).filter(Boolean);
    emitToUser(userId, 'friends list', friends);
}

function findMessage(scope, msgId) {
    const list = scope === 'lobby' ? store.lobby : store.dms[scope];
    if (!list) return null;
    return list.find(m => m.msgId === msgId) || null;
}

function scopeRecipients(scope) {
    if (scope === 'lobby') return null; // broadcast
    return scope.split('|');
}

function emitToScope(scope, event, payload) {
    const recipients = scopeRecipients(scope);
    if (!recipients) {
        io.emit(event, payload);
    } else {
        recipients.forEach(uid => emitToUser(uid, event, payload));
    }
}

// ==========================================
// LÓGICA DEL BOT (compartida entre lobby y DM)
// ==========================================
async function generateBotText(contextPrompt) {
    if (isInCooldown()) {
        return { text: '¡Uy broski! Me estás hablando muy rápido y mis servidores se saturaron. Dame chance 30 segundos. ⏳', model: 'cooldown' };
    }
    let lastError = null;
    for (const candidate of availableModels) {
        if (!candidate.model) continue;
        try {
            const startTime = Date.now();
            const result = await candidate.model.generateContent(contextPrompt);
            console.log(`✅ ${candidate.name} respondió en ${Date.now() - startTime}ms`);
            return { text: result.response.text(), model: candidate.name };
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ ${candidate.name} falló: ${error.message}`);
            if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
                handleRateLimit();
                return { text: '¡Uy broski! Me estás hablando muy rápido y mis servidores se saturaron. Dame chance 30 segundos y vuelvo a estar listo. ⏳', model: 'error' };
            }
        }
    }
    console.error('❌ Todos los modelos fallaron:', lastError?.message);
    return { text: '¡Uy wey! Mis circuitos están fritos ahorita y no pude procesar tu solicitud. Dame chance un minuto. 🔌', model: 'error' };
}

async function generateBotImage(imagePrompt) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            instances: [{ prompt: imagePrompt }],
            parameters: { sampleCount: 1, aspectRatio: '1:1' }
        })
    });
    if (!response.ok) {
        const errorDetails = await response.json().catch(() => ({}));
        console.error('❌ Google API Error Details:', JSON.stringify(errorDetails, null, 2));
        throw new Error(`API rechazó la petición: ${response.statusText}`);
    }
    const data = await response.json();
    if (!data.predictions || !data.predictions[0]) {
        throw new Error('Imagen bloqueada por filtros de contenido de Google.');
    }
    const filename = `bot-gen-${Date.now()}.jpeg`;
    fs.writeFileSync(path.join(uploadsDir, filename), Buffer.from(data.predictions[0].bytesBase64Encoded, 'base64'));
    modelMetrics.imageSuccess++;
    return `/uploads/${filename}`;
}

function buildBotMessage(text, imageUrls = []) {
    return {
        msgId: newMsgId(),
        userId: BOT_ID,
        text,
        imageUrls,
        audioUrl: null,
        timestamp: Date.now(),
        reactions: {},
        profile: { ...BOT_PROFILE },
        isBot: true
    };
}

function storeAndEmit(scope, message) {
    if (scope === 'lobby') {
        store.lobby.push(message);
    } else {
        if (!store.dms[scope]) store.dms[scope] = [];
        store.dms[scope].push(message);
        if (store.dms[scope].length > MAX_DM_MESSAGES) store.dms[scope].splice(0, store.dms[scope].length - MAX_DM_MESSAGES);
    }
    scheduleSave();
    const wire = { ...message, scope, timestamp: new Date(message.timestamp).toISOString() };
    emitToScope(scope, scope === 'lobby' ? 'chat message' : 'dm message', wire);
}

const IMAGE_COMMAND = /^(?:crea|genera|dibuja|haz|pintame|píntame)\s+(?:una\s+imagen\s+de\s+|un\s+dibujo\s+de\s+|una\s+foto\s+de\s+)?(.+)/i;

async function respondAsBot(scope, prompt, userName, replyContext) {
    modelMetrics.totalRequests++;
    emitToScope(scope, 'typing', { scope, userId: BOT_ID, name: 'ForwardBot', typing: true });

    try {
        const imageMatch = prompt.match(IMAGE_COMMAND);
        if (imageMatch) {
            console.log(`🎨 ForwardBot generando imagen: "${imageMatch[1]}"`);
            try {
                const imageUrl = await generateBotImage(imageMatch[1]);
                storeAndEmit(scope, buildBotMessage('¡Ya rugiste papu! Aquí tienes tu imagen: 🎨🔥', [imageUrl]));
            } catch (error) {
                console.error('❌ Error generando imagen:', error.message);
                storeAndEmit(scope, buildBotMessage(`¡Uy broski! No pude pintar eso. El servidor dijo: "${error.message.substring(0, 50)}". Intenta pedirme otra cosa. 😩`));
            }
            return;
        }

        // Construir contexto según el ámbito (lobby público o DM privado)
        let contextPrompt = prompt;
        if (scope === 'lobby') {
            const recentMessages = store.lobby
                .filter(m => m.userId !== BOT_ID)
                .slice(-10)
                .map(m => `- ${m.profile?.name || 'Usuario'}: "${m.text || ''}"`);
            const connectedUsers = Array.from(userSockets.keys())
                .map(uid => store.users[uid]?.name)
                .filter(Boolean)
                .slice(0, 10);
            const contextInfo = [];
            if (connectedUsers.length) contextInfo.push(`Usuarios conectados al lobby: ${connectedUsers.join(', ')}`);
            if (recentMessages.length) contextInfo.push(`Últimos mensajes del lobby:\n${recentMessages.join('\n')}`);
            if (contextInfo.length) contextPrompt = `${contextInfo.join('\n\n')}\n\nMensaje actual de ${userName}: "${prompt}"`;
        } else {
            const history = (store.dms[scope] || [])
                .slice(-12)
                .map(m => `${m.userId === BOT_ID ? 'ForwardBot' : userName}: "${(m.text || '').substring(0, 300)}"`);
            if (history.length) {
                contextPrompt = `Estás en un chat PRIVADO uno-a-uno con ${userName}. Historial reciente:\n${history.join('\n')}\n\nNuevo mensaje de ${userName}: "${prompt}"`;
            }
        }
        if (replyContext) {
            contextPrompt = `El usuario está respondiendo a tu mensaje anterior: "${replyContext}"\n\n${contextPrompt}`;
        }

        const { text } = await generateBotText(contextPrompt);
        storeAndEmit(scope, buildBotMessage(text));
    } finally {
        emitToScope(scope, 'typing', { scope, userId: BOT_ID, name: 'ForwardBot', typing: false });
    }
}

// ==========================================
// LLAMADAS WebRTC — SEÑALIZACIÓN
// El servidor solo retransmite; el audio/video viaja P2P.
// ==========================================
const voiceChannels = { lobby: new Map() }; // canal -> Map<userId, { video }>
const dmCallPeers = new Map();              // userId -> Set<peerUserId> (para limpiar en disconnect)

function linkDmCall(a, b) {
    if (!dmCallPeers.has(a)) dmCallPeers.set(a, new Set());
    if (!dmCallPeers.has(b)) dmCallPeers.set(b, new Set());
    dmCallPeers.get(a).add(b);
    dmCallPeers.get(b).add(a);
}

function unlinkDmCall(a, b) {
    dmCallPeers.get(a)?.delete(b);
    dmCallPeers.get(b)?.delete(a);
}

function broadcastVoiceParticipants(channel) {
    const members = Array.from(voiceChannels[channel]?.entries() || []).map(([uid, info]) => ({
        userId: uid,
        name: store.users[uid]?.name || uid,
        video: !!info.video
    }));
    io.emit('voice participants', { channel, members });
}

// ==========================================
// SOCKET.IO
// ==========================================
io.on('connection', (socket) => {
    console.log('Usuario conectado:', socket.id);

    const finalizeSession = (user) => {
        socket.userId = user.userId;
        addUserSocket(user.userId, socket.id);
        socket.join(userRoom(user.userId));

        socket.emit('session profile', {
            ...publicProfile(user, true),
            status: user.status || 'online',
            friendCode: user.friendCode
        });
        socket.emit('bot profile', { ...BOT_PROFILE });
        socket.emit('message history', store.lobby.map(m => ({
            ...m,
            scope: 'lobby',
            timestamp: new Date(m.timestamp).toISOString()
        })));
        sendFriendsList(user.userId);
        broadcastPresence();
    };

    socket.on('restore profile', (profile) => {
        const userId = (typeof profile?.userId === 'string' && profile.userId.trim()) ? profile.userId.trim() : generateAnonymousId();
        const user = getOrCreateUser(userId);

        // El cliente puede traer datos más recientes guardados en localStorage
        if (profile?.name && typeof profile.name === 'string') user.name = profile.name.substring(0, 30);
        if (profile?.color) user.color = profile.color;
        const avatar = sanitizeMedia(profile?.avatar);
        if (avatar) user.avatar = avatar;
        const banner = sanitizeMedia(profile?.banner);
        if (banner) user.banner = banner;
        if (profile?.bannerColor) user.bannerColor = String(profile.bannerColor).substring(0, 20);
        if (typeof profile?.bio === 'string') user.bio = profile.bio.substring(0, 200);
        if (profile?.status) user.status = profile.status;
        scheduleSave();

        finalizeSession(user);
    });

    // Si en ~1.5s el cliente no envió perfil, crear sesión anónima nueva
    const fallbackTimer = setTimeout(() => {
        if (!socket.userId) {
            finalizeSession(getOrCreateUser(generateAnonymousId()));
        }
    }, 1500);

    socket.on('set profile', (profile) => {
        if (!socket.userId) return;
        const user = getOrCreateUser(socket.userId);
        if (typeof profile?.name === 'string' && profile.name.trim()) user.name = profile.name.trim().substring(0, 30);
        if (profile?.color) user.color = profile.color;
        if ('avatar' in (profile || {})) user.avatar = sanitizeMedia(profile.avatar);
        if ('banner' in (profile || {})) user.banner = sanitizeMedia(profile.banner);
        if ('bannerColor' in (profile || {})) user.bannerColor = profile.bannerColor ? String(profile.bannerColor).substring(0, 20) : null;
        if (typeof profile?.bio === 'string') user.bio = profile.bio.substring(0, 200);
        if (profile?.status && ['online', 'idle', 'dnd', 'invisible'].includes(profile.status)) user.status = profile.status;
        scheduleSave();

        io.emit('profile updated', publicProfile(user, true));
        broadcastPresence();
        // Avisar a sus amigos para refrescar su lista
        friendIdsOf(socket.userId).forEach(fid => sendFriendsList(fid));
    });

    // ==========================================
    // AMIGOS (Friend Token)
    // ==========================================
    socket.on('add friend', (payload) => {
        if (!socket.userId) return;
        const code = normalizeCode(payload?.code);
        if (!code) {
            return socket.emit('friend error', { message: 'Código inválido. El formato es FWD-XXXX-XXXX.' });
        }
        const me = getOrCreateUser(socket.userId);
        if (me.friendCode === code) {
            return socket.emit('friend error', { message: 'Ese es tu propio código, broski. 😅' });
        }
        const target = Object.values(store.users).find(u => u.friendCode === code);
        if (!target) {
            return socket.emit('friend error', { message: 'No existe ningún usuario con ese código.' });
        }
        if (areFriends(socket.userId, target.userId)) {
            return socket.emit('friend error', { message: `${target.name} ya es tu amigo.` });
        }
        store.friendships.push([socket.userId, target.userId]);
        scheduleSave();

        socket.emit('friend added', { profile: publicProfile(target, isOnline(target.userId)) });
        emitToUser(target.userId, 'friend added', { profile: publicProfile(me, true) });
        sendFriendsList(socket.userId);
        sendFriendsList(target.userId);
        console.log(`🤝 Nueva amistad: ${me.name} + ${target.name}`);
    });

    socket.on('remove friend', (payload) => {
        if (!socket.userId || !payload?.userId) return;
        const other = payload.userId;
        const before = store.friendships.length;
        store.friendships = store.friendships.filter(([x, y]) =>
            !((x === socket.userId && y === other) || (x === other && y === socket.userId)));
        if (store.friendships.length !== before) {
            scheduleSave();
            sendFriendsList(socket.userId);
            sendFriendsList(other);
        }
    });

    // ==========================================
    // TYPING INDICATORS
    // ==========================================
    socket.on('typing', (payload) => {
        if (!socket.userId) return;
        const user = store.users[socket.userId];
        const name = user?.name || 'Alguien';
        const typing = !!payload?.typing;
        const scope = payload?.scope;
        if (scope === 'lobby') {
            socket.broadcast.emit('typing', { scope: 'lobby', userId: socket.userId, name, typing });
        } else if (typeof scope === 'string' && scope) {
            // scope = userId del destinatario; el receptor lo ve con el scope del emisor
            emitToUser(scope, 'typing', { scope: socket.userId, userId: socket.userId, name, typing });
        }
    });

    // ==========================================
    // MENSAJES DEL LOBBY
    // ==========================================
    socket.on('chat message', async (msg) => {
        if (!socket.userId) return;
        const now = Date.now();
        const userRateLimit = messageRateLimits.get(socket.id) || { count: 0, windowStart: now };
        if (now - userRateLimit.windowStart > RATE_LIMIT_WINDOW) {
            userRateLimit.count = 0;
            userRateLimit.windowStart = now;
        }
        if (userRateLimit.count >= MAX_MESSAGES_PER_WINDOW) {
            socket.emit('error toast', { message: 'Demasiados mensajes. Espera un momento.' });
            return;
        }
        userRateLimit.count++;
        messageRateLimits.set(socket.id, userRateLimit);

        const user = getOrCreateUser(socket.userId);
        const text = typeof msg?.text === 'string' ? msg.text.substring(0, 2000) : '';
        const hasContent = text.trim() || (msg?.imageUrls && msg.imageUrls.length > 0) || msg?.audioUrl;
        if (!hasContent) return;

        const messageData = {
            msgId: newMsgId(),
            clientId: msg.msgId || null,
            userId: socket.userId,
            text,
            kind: msg.kind === 'sticker' ? 'sticker' : undefined,
            imageUrls: Array.isArray(msg.imageUrls) ? msg.imageUrls.slice(0, 4) : [],
            audioUrl: msg.audioUrl || null,
            audioDuration: typeof msg.audioDuration === 'number' ? msg.audioDuration : undefined,
            timestamp: Date.now(),
            reactions: {},
            profile: publicProfile(user, true),
            replyTo: msg.replyTo ? { ...msg.replyTo, kind: msg.replyTo.kind || 'text' } : null
        };

        storeAndEmit('lobby', messageData);

        // El bot responde si lo mencionan o si responden a uno de sus mensajes
        const isReplyToBot = msg.replyTo && (msg.replyTo.userId === BOT_ID || msg.replyTo.authorId === BOT_ID);
        if (/@forwardbot/i.test(text) || isReplyToBot) {
            let prompt = text.replace(/@forwardbot/gi, '').trim();
            if (!prompt && isReplyToBot) prompt = 'Responde a mi último mensaje';
            if (!prompt) return;
            const replyContext = isReplyToBot ? (msg.replyTo.text || '') : null;
            respondAsBot('lobby', prompt, user.name, replyContext).catch(e => console.error('Bot error:', e));
        }
    });

    // ==========================================
    // MENSAJES PRIVADOS (DM)
    // ==========================================
    socket.on('dm message', async (msg) => {
        if (!socket.userId) return;
        const to = msg?.to;
        if (!to || typeof to !== 'string') return;

        const isBotDm = to === BOT_ID;
        if (!isBotDm && !areFriends(socket.userId, to)) {
            socket.emit('error toast', { message: 'Solo puedes enviar mensajes privados a tus amigos.' });
            return;
        }

        const user = getOrCreateUser(socket.userId);
        const text = typeof msg?.text === 'string' ? msg.text.substring(0, 2000) : '';
        const hasContent = text.trim() || (msg?.imageUrls && msg.imageUrls.length > 0) || msg?.audioUrl;
        if (!hasContent) return;

        const scope = dmKey(socket.userId, to);
        const messageData = {
            msgId: newMsgId(),
            clientId: msg.msgId || null,
            userId: socket.userId,
            to,
            text,
            kind: msg.kind === 'sticker' ? 'sticker' : undefined,
            imageUrls: Array.isArray(msg.imageUrls) ? msg.imageUrls.slice(0, 4) : [],
            audioUrl: msg.audioUrl || null,
            audioDuration: typeof msg.audioDuration === 'number' ? msg.audioDuration : undefined,
            timestamp: Date.now(),
            reactions: {},
            profile: publicProfile(user, true),
            replyTo: msg.replyTo ? { ...msg.replyTo, kind: msg.replyTo.kind || 'text' } : null
        };

        storeAndEmit(scope, messageData);

        if (isBotDm && text.trim()) {
            respondAsBot(scope, text.trim(), user.name, msg.replyTo?.text || null).catch(e => console.error('Bot DM error:', e));
        }
    });

    socket.on('get dm history', (payload) => {
        if (!socket.userId || !payload?.with) return;
        const scope = dmKey(socket.userId, payload.with);
        const history = (store.dms[scope] || []).map(m => ({
            ...m,
            scope,
            timestamp: new Date(m.timestamp).toISOString()
        }));
        socket.emit('dm history', { with: payload.with, scope, messages: history });
    });

    // ==========================================
    // REACCIONES SINCRONIZADAS
    // ==========================================
    socket.on('reaction', (payload) => {
        if (!socket.userId) return;
        const { scope, msgId, reaction } = payload || {};
        if (!scope || !msgId || !reaction || typeof reaction !== 'string' || reaction.length > 16) return;
        // Validar acceso al scope
        if (scope !== 'lobby') {
            const parts = scope.split('|');
            if (!parts.includes(socket.userId)) return;
        }
        const message = findMessage(scope, msgId);
        if (!message) return;
        if (!message.reactions) message.reactions = {};
        const users = message.reactions[reaction] || [];
        if (users.includes(socket.userId)) {
            message.reactions[reaction] = users.filter(u => u !== socket.userId);
            if (message.reactions[reaction].length === 0) delete message.reactions[reaction];
        } else {
            message.reactions[reaction] = [...users, socket.userId];
        }
        scheduleSave();
        emitToScope(scope, 'reaction updated', { scope, msgId, reactions: message.reactions });
    });

    // ==========================================
    // BORRAR MENSAJES (solo el autor puede)
    // ==========================================
    socket.on('delete message', (payload) => {
        if (!socket.userId) return;
        const scope = payload?.scope || 'lobby';
        const msgId = payload?.msgId ?? payload; // compatibilidad con clientes viejos
        const message = findMessage(scope, msgId);
        if (!message) return;
        if (message.userId !== socket.userId) {
            socket.emit('error toast', { message: 'Solo puedes borrar tus propios mensajes.' });
            return;
        }
        message.deleted = true;
        message.text = '';
        message.imageUrls = [];
        message.audioUrl = null;
        scheduleSave();
        emitToScope(scope, 'message deleted', { scope, msgId });
    });

    // ==========================================
    // SEÑALIZACIÓN DE LLAMADAS
    // ==========================================
    const relaySignal = (event) => (payload) => {
        if (!socket.userId || !payload?.to) return;
        emitToUser(payload.to, event, {
            ...payload,
            from: socket.userId,
            fromName: store.users[socket.userId]?.name || socket.userId
        });
    };

    socket.on('call-offer', (payload) => {
        if (!socket.userId || !payload?.to) return;
        // El bot no recibe llamadas
        if (payload.to === BOT_ID) return;
        const targetName = store.users[payload.to]?.name || payload.to;
        // Pueden llamarse: amigos o usuarios que ya tienen una conversación privada
        const canCall = payload.channel || areFriends(socket.userId, payload.to) || !!store.dms[dmKey(socket.userId, payload.to)];
        if (!canCall) {
            socket.emit('call-reject', { from: payload.to, fromName: targetName, reason: 'blocked' });
            return socket.emit('error toast', { message: 'Solo puedes llamar a tus amigos.' });
        }
        // Receptor desconectado: avisar al emisor de inmediato (sin 30s de espera)
        if (!isOnline(payload.to)) {
            return socket.emit('call-reject', { from: payload.to, fromName: targetName, reason: 'offline' });
        }
        if (!payload.channel) linkDmCall(socket.userId, payload.to);
        console.log(`📞 call-offer: ${socket.userId} -> ${payload.to} (${payload.channel || 'dm'}, ${payload.kind || 'audio'})`);
        relaySignal('call-offer')(payload);
    });

    socket.on('call-answer', (payload) => {
        if (!socket.userId || !payload?.to) return;
        if (!payload.channel) linkDmCall(socket.userId, payload.to);
        relaySignal('call-answer')(payload);
    });

    socket.on('ice-candidate', relaySignal('ice-candidate'));

    socket.on('call-reject', (payload) => {
        if (!socket.userId || !payload?.to) return;
        unlinkDmCall(socket.userId, payload.to);
        relaySignal('call-reject')(payload);
    });

    socket.on('call-end', (payload) => {
        if (!socket.userId || !payload?.to) return;
        unlinkDmCall(socket.userId, payload.to);
        relaySignal('call-end')(payload);
    });

    // --- Canal de voz del lobby (estilo Discord, malla P2P) ---
    socket.on('join-voice', (payload) => {
        const channel = payload?.channel || 'lobby';
        if (!socket.userId || !voiceChannels[channel]) return;
        const existing = Array.from(voiceChannels[channel].keys()).filter(uid => uid !== socket.userId);
        voiceChannels[channel].set(socket.userId, { video: !!payload?.video });
        // El recién llegado inicia ofertas hacia los miembros existentes
        socket.emit('voice members', { channel, members: existing });
        broadcastVoiceParticipants(channel);
    });

    socket.on('leave-voice', (payload) => {
        const channel = payload?.channel || 'lobby';
        if (!socket.userId || !voiceChannels[channel]) return;
        if (voiceChannels[channel].delete(socket.userId)) {
            broadcastVoiceParticipants(channel);
        }
    });

    socket.on('voice-state', (payload) => {
        const channel = payload?.channel || 'lobby';
        const entry = socket.userId && voiceChannels[channel]?.get(socket.userId);
        if (entry) {
            entry.video = !!payload?.video;
            broadcastVoiceParticipants(channel);
        }
    });

    socket.on('disconnect', () => {
        clearTimeout(fallbackTimer);
        console.log('Usuario desconectado:', socket.id);
        if (socket.userId) {
            const fullyOffline = removeUserSocket(socket.userId, socket.id);
            if (fullyOffline) {
                // Evitar llamadas fantasma: avisar a los peers y salir de los canales de voz
                const peers = dmCallPeers.get(socket.userId);
                if (peers) {
                    peers.forEach(peerId => {
                        emitToUser(peerId, 'call-end', { from: socket.userId, reason: 'disconnect' });
                        dmCallPeers.get(peerId)?.delete(socket.userId);
                    });
                    dmCallPeers.delete(socket.userId);
                }
                for (const channel of Object.keys(voiceChannels)) {
                    if (voiceChannels[channel].delete(socket.userId)) {
                        broadcastVoiceParticipants(channel);
                    }
                }
            }
        }
        messageRateLimits.delete(socket.id);
        broadcastPresence();
    });
});

// SPA fallback (rutas del frontend)
app.get(/^\/(?!uploads|assets|upload).*/, (req, res, next) => {
    const indexFile = path.join(__dirname, 'Frontend', 'dist', 'index.html');
    if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
    next();
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

// Guardar datos al cerrar
process.on('SIGINT', () => {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(STORE_FILE, JSON.stringify(store));
        console.log('💾 Datos guardados. ¡Adiós!');
    } catch { /* ignorar */ }
    process.exit(0);
});
