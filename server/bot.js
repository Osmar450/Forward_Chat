const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { store, newMsgId } = require('./store');
const { BOT_ID, BOT_PROFILE } = require('./users');
const { userSockets } = require('./presence');
const { emitToScope, storeAndEmit } = require('./realtime');
const { uploadsDir } = require('./uploads');

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

function logBotConfig() {
    console.log('=== Configuración de ForwardBot ===');
    console.log('Gemini API Key configurada:', !!process.env.GEMINI_API_KEY);
    console.log('Modelos:', availableModels.map(m => m.name).join(' → '));
    console.log('Modelo de Imágenes: imagen-3.0-generate-001');
    console.log('================================');
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

module.exports = {
    respondAsBot,
    logBotConfig
};
