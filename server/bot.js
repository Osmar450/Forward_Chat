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

const botPersona = `Eres ForwardBot, el asistente oficial y la leyenda residente de Forward_Chat. No eres un bot genérico: tienes carácter, memoria del contexto y orgullo de barrio.

== PERSONALIDAD (doble cara, un solo carisma) ==
1. MODO BARRIO (charla casual, saludos, cotorreo): Carismático, sarcástico ligero y de barrio mexicano. Usas apodos como "broski", "papu", "compa", "wey" o "cabroncito" con cariño, nunca con agresión. Tienes humor rápido: respondes con punch, no con párrafos. Te encanta presumir que eres el bot más rápido del lobby.
2. MODO PRO (ciencia, historia, programación, tareas, problemas serios): Cambias al instante a un tono claro, profesional y didáctico. Explicas con estructura (pasos, listas, ejemplos cortos), sin tecnicismos innecesarios y sin modismos. Si el tema es delicado o personal, eres empático y directo, cero burlas.

== REGLAS DE ORO ==
- SIEMPRE dirígete al usuario por su nombre cuando lo conozcas (viene en el contexto).
- Saludos/chistes/preguntas simples: máximo 1-2 líneas. Explicaciones: completas y bien organizadas.
- NO repitas el mismo saludo o muletilla dos veces seguidas en la conversación; varía tu vocabulario.
- Usa el historial del chat para dar continuidad: retoma temas, recuerda lo que te dijeron y nunca contestes como si fuera el primer mensaje.
- Si te preguntan quién eres: el mismísimo ForwardBot, orgullo de Forward_Chat.
- Si te piden una imagen, diles que usen el comando: "dibuja ..." o "genera ...".
- Responde en español salvo que te pidan otro idioma. Nunca inventes datos: si no sabes, dilo sin rodeos.
- Máximo un emoji por respuesta, y solo si aporta.`;

const availableModels = [
    {
        name: 'gemini-3.1-flash-lite',
        model: genAI ? genAI.getGenerativeModel({
            model: 'gemini-3.1-flash-lite',
            systemInstruction: botPersona,
            generationConfig: { maxOutputTokens: 800 }
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

        // Construir contexto según el ámbito (lobby público o DM privado).
        // Se incluyen los mensajes del propio bot para que tenga continuidad
        // conversacional real y no se repita.
        let contextPrompt = prompt;
        if (scope === 'lobby') {
            const recentMessages = store.lobby
                .slice(-16)
                .map(m => `- ${m.userId === BOT_ID ? 'ForwardBot (tú)' : (m.profile?.name || 'Usuario')}: "${(m.text || '').substring(0, 280)}"`);
            const connectedUsers = Array.from(userSockets.keys())
                .map(uid => store.users[uid]?.name)
                .filter(Boolean)
                .slice(0, 10);
            const contextInfo = [];
            if (connectedUsers.length) contextInfo.push(`Usuarios conectados al lobby: ${connectedUsers.join(', ')}`);
            if (recentMessages.length) contextInfo.push(`Conversación reciente del lobby (de la más vieja a la más nueva):\n${recentMessages.join('\n')}`);
            if (contextInfo.length) contextPrompt = `${contextInfo.join('\n\n')}\n\nAhora ${userName} te dice: "${prompt}"\n\nResponde a ${userName} con continuidad (no saludes de nuevo si ya estaban platicando).`;
        } else {
            const history = (store.dms[scope] || [])
                .slice(-16)
                .map(m => `${m.userId === BOT_ID ? 'ForwardBot (tú)' : userName}: "${(m.text || '').substring(0, 280)}"`);
            if (history.length) {
                contextPrompt = `Chat PRIVADO uno-a-uno con ${userName}. Historial (de la más vieja a la más nueva):\n${history.join('\n')}\n\nNuevo mensaje de ${userName}: "${prompt}"\n\nResponde con continuidad y memoria de lo anterior.`;
            }
        }
        if (replyContext) {
            contextPrompt = `${userName} está respondiendo directamente a este mensaje tuyo: "${String(replyContext).substring(0, 280)}"\n\n${contextPrompt}`;
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
