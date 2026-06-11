const { store, newMsgId, scheduleSave } = require('../store');
const { getOrCreateUser, publicProfile, dmKey, areFriends, BOT_ID } = require('../users');
const { emitToUser, storeAndEmit } = require('../realtime');
const { respondAsBot } = require('../bot');

// ==========================================
// MENSAJES (lobby + DM) Y TYPING
// ==========================================
const messageRateLimits = new Map();
const RATE_LIMIT_WINDOW = 10000;
const MAX_MESSAGES_PER_WINDOW = 12;

function register(io, socket) {
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
        socket.emit('dm history', { with: payload.with, scope, messages: history, reads: (store.reads && store.reads[scope]) || {} });
    });

    // ==========================================
    // CONFIRMACIONES DE LECTURA (solo DMs)
    // ==========================================
    socket.on('dm read', (payload) => {
        if (!socket.userId || typeof payload?.with !== 'string' || !payload.with) return;
        const scope = dmKey(socket.userId, payload.with);
        if (!store.dms[scope]) return; // sin conversación, nada que marcar
        if (!store.reads) store.reads = {};
        if (!store.reads[scope]) store.reads[scope] = {};
        const at = Date.now();
        store.reads[scope][socket.userId] = at;
        scheduleSave();
        emitToUser(payload.with, 'dm read', { scope, by: socket.userId, at });
    });
}

module.exports = { register, messageRateLimits };
