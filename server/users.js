const { store, scheduleSave } = require('./store');

// ==========================================
// FRIEND TOKEN: identificador Ãºnico que simula
// ser un "nÃºmero" (formato FWD-XXXX-XXXX)
// ==========================================
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin caracteres ambiguos (0/O, 1/I)

// ==========================================
// ÃNDICES EN MEMORIA (lookups O(1) sobre el store JSON)
// - friendCodeIndex: cÃ³digo -> userId (evita escanear todos los usuarios)
// - friendshipIndex: "a|b" ordenado -> true (evita escanear todas las amistades)
// Se reconstruyen al cargar y se mantienen en cada mutaciÃ³n.
// ==========================================
const friendCodeIndex = new Map();
const friendshipIndex = new Set();

function rebuildIndexes() {
    friendCodeIndex.clear();
    friendshipIndex.clear();
    for (const user of Object.values(store.users)) {
        if (user.friendCode) friendCodeIndex.set(user.friendCode, user.userId);
    }
    for (const [a, b] of store.friendships) {
        friendshipIndex.add([a, b].sort().join('|'));
    }
}
rebuildIndexes();

function findUserByCode(code) {
    const userId = friendCodeIndex.get(code);
    return userId ? store.users[userId] : null;
}

function generateFriendCode() {
    const block = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    let code;
    do {
        code = `FWD-${block()}-${block()}`;
    } while (friendCodeIndex.has(code));
    return code;
}

function normalizeCode(input) {
    if (!input) return '';
    const clean = String(input).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const body = clean.startsWith('FWD') ? clean.slice(3) : clean;
    if (body.length !== 8) return '';
    return `FWD-${body.slice(0, 4)}-${body.slice(4)}`;
}

// ~40MB binarios en base64 (≈54MB de string): banners GIF/MP4 antes de comprimir
const MAX_DATAURL_LENGTH = 56_000_000;
const ALLOWED_MEDIA = /^data:(image\/(png|jpe?g|gif|webp)|video\/(mp4|webm));base64,/i;

function sanitizeMedia(value) {
    if (typeof value !== 'string') return null;
    if (value.length > MAX_DATAURL_LENGTH) return null;
    // Solo data URLs de imagen/video permitidas (evita inyectar otros esquemas)
    if (value.startsWith('data:') && !ALLOWED_MEDIA.test(value)) return null;
    return value;
}

function getOrCreateUser(userId) {
    if (!store.users[userId]) {
        const friendCode = generateFriendCode();
        store.users[userId] = {
            userId,
            friendCode,
            name: userId,
            avatar: null,
            color: null,
            banner: null,
            bannerColor: null,
            bio: '',
            status: 'online',
            createdAt: Date.now()
        };
        friendCodeIndex.set(friendCode, userId);
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

// Contador perezoso: se inicializa en el primer uso, cuando el store ya cargÃ³
let anonymousCounter = null;
const generateAnonymousId = () => {
    if (anonymousCounter === null) anonymousCounter = Object.keys(store.users).length + 1;
    let id;
    do {
        id = `anonimo_${anonymousCounter++}`;
    } while (store.users[id]);
    return id;
};

const BOT_ID = 'forwardbot';
const BOT_PROFILE = {
    userId: BOT_ID,
    name: 'ForwardBot',
    avatar: '/assets/Forward_Bot.png',
    color: '#8B5CF6',
    banner: '/assets/banner.png',
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
    return friendshipIndex.has(dmKey(a, b));
}

function addFriendship(a, b) {
    if (areFriends(a, b)) return false;
    store.friendships.push([a, b]);
    friendshipIndex.add(dmKey(a, b));
    scheduleSave();
    return true;
}

function removeFriendship(a, b) {
    const before = store.friendships.length;
    store.friendships = store.friendships.filter(([x, y]) =>
        !((x === a && y === b) || (x === b && y === a)));
    friendshipIndex.delete(dmKey(a, b));
    if (store.friendships.length !== before) {
        scheduleSave();
        return true;
    }
    return false;
}

function friendIdsOf(userId) {
    return store.friendships
        .filter(([x, y]) => x === userId || y === userId)
        .map(([x, y]) => (x === userId ? y : x));
}

// ==========================================
// SANEAMIENTO DE TEXTO
// Nota de auditoría: el almacenamiento es JSON en disco (sin SQL/NoSQL), por
// lo que no hay vectores de inyección de consultas; aun así, todo texto de
// usuario se acota en longitud y se limpia de caracteres de control antes de
// persistirse o retransmitirse.
// ==========================================
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
function cleanText(value, maxLen = 2000) {
    if (typeof value !== 'string') return '';
    return value.replace(CONTROL_CHARS, '').substring(0, maxLen);
}

module.exports = {
    generateFriendCode,
    normalizeCode,
    sanitizeMedia,
    cleanText,
    getOrCreateUser,
    publicProfile,
    generateAnonymousId,
    findUserByCode,
    rebuildIndexes,
    BOT_ID,
    BOT_PROFILE,
    dmKey,
    areFriends,
    addFriendship,
    removeFriendship,
    friendIdsOf
};
