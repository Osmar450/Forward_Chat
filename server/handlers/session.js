const { store, scheduleSave } = require('../store');
const { getOrCreateUser, publicProfile, generateAnonymousId, sanitizeMedia, cleanText, friendIdsOf, BOT_PROFILE } = require('../users');
const { addUserSocket, removeUserSocket, blocksByUser, blockersOf } = require('../presence');
const { emitAll, emitToUser, broadcastPresence, sendFriendsList } = require('../realtime');
const { voiceChannels, dmCallPeers, broadcastVoiceParticipants } = require('./calls');
const { messageRateLimits, HISTORY_PAGE_SIZE } = require('./messages');
const { compressBannerDataUrl } = require('../media');

// ==========================================
// SESIÓN: restaurar/crear perfil, presencia y desconexión
// ==========================================
function register(io, socket) {
    const finalizeSession = (user) => {
        socket.userId = user.userId;
        addUserSocket(user.userId, socket.id);
        socket.join(`u:${user.userId}`);
        socket.join('lobby'); // room explícito del canal público

        socket.emit('session profile', {
            ...publicProfile(user, true),
            status: user.status || 'online',
            friendCode: user.friendCode
        });
        socket.emit('bot profile', { ...BOT_PROFILE });
        // Paginación: solo la última página del lobby; el resto va por cursor
        const lobbyPage = store.lobby.slice(-HISTORY_PAGE_SIZE);
        socket.emit('message history', lobbyPage.map(m => ({
            ...m,
            scope: 'lobby',
            timestamp: new Date(m.timestamp).toISOString()
        })));
        socket.emit('history meta', { with: 'lobby', hasMore: store.lobby.length > lobbyPage.length });
        sendFriendsList(user.userId);
        // Quiénes me bloquearon (mi cliente oculta sus avatares/banners)
        socket.emit('blocked by', { ids: blockersOf(user.userId) });
        broadcastPresence();
    };

    // Lista de bloqueados del usuario: oculta su avatar a los bloqueados
    socket.on('set blocks', (payload) => {
        if (!socket.userId) return;
        const ids = Array.isArray(payload?.ids)
            ? payload.ids.filter(x => typeof x === 'string' && x.length <= 32).slice(0, 200)
            : [];
        const prev = blocksByUser.get(socket.userId) || new Set();
        const next = new Set(ids);
        blocksByUser.set(socket.userId, next);
        // Notificar solo a los afectados (entraron o salieron de la lista)
        new Set([...prev, ...next]).forEach(uid => {
            emitToUser(uid, 'blocked by', { ids: blockersOf(uid) });
        });
    });

    // Solo IDs alfanuméricos: evita inyectar separadores de scope ("|"),
    // rutas o ids reservados a través del localStorage del cliente.
    const SAFE_USER_ID = /^[A-Za-z0-9_-]{1,32}$/;

    socket.on('restore profile', (profile) => {
        const requested = typeof profile?.userId === 'string' ? profile.userId.trim() : '';
        const userId = (requested && SAFE_USER_ID.test(requested) && requested !== 'forwardbot' && requested !== 'lobby')
            ? requested
            : generateAnonymousId();
        const user = getOrCreateUser(userId);

        // El cliente puede traer datos más recientes guardados en localStorage
        if (profile?.name && typeof profile.name === 'string') user.name = cleanText(profile.name, 30);
        if (profile?.color) user.color = profile.color;
        const avatar = sanitizeMedia(profile?.avatar);
        if (avatar) user.avatar = avatar;
        const banner = sanitizeMedia(profile?.banner);
        if (banner) {
            user.banner = banner;
            // Comprimir en segundo plano sin bloquear el arranque de sesión
            compressBannerDataUrl(banner).then((c) => { if (c && c !== user.banner) { user.banner = c; scheduleSave(); } }).catch(() => {});
        }
        if (profile?.bannerColor) user.bannerColor = String(profile.bannerColor).substring(0, 20);
        if (typeof profile?.bio === 'string') user.bio = cleanText(profile.bio, 200);
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

    socket.on('set profile', async (profile) => {
        if (!socket.userId) return;
        const user = getOrCreateUser(socket.userId);
        if (typeof profile?.name === 'string' && profile.name.trim()) user.name = cleanText(profile.name.trim(), 30);
        if (profile?.color) user.color = profile.color;
        if ('avatar' in (profile || {})) user.avatar = sanitizeMedia(profile.avatar);
        if ('banner' in (profile || {})) {
            const banner = sanitizeMedia(profile.banner);
            // Compresión del servidor (sharp) para banners pesados (GIF/imagen)
            user.banner = banner ? await compressBannerDataUrl(banner) : null;
        }
        if ('bannerColor' in (profile || {})) user.bannerColor = profile.bannerColor ? String(profile.bannerColor).substring(0, 20) : null;
        if (typeof profile?.bio === 'string') user.bio = cleanText(profile.bio, 200);
        if (profile?.status && ['online', 'idle', 'dnd', 'invisible'].includes(profile.status)) user.status = profile.status;
        scheduleSave();

        emitAll('profile updated', publicProfile(user, true));
        broadcastPresence();
        // Avisar a sus amigos para refrescar su lista
        friendIdsOf(socket.userId).forEach(fid => sendFriendsList(fid));
    });

    // Medición de latencia: el cliente emite con ack y mide el RTT
    socket.on('latency ping', (cb) => {
        if (typeof cb === 'function') cb(Date.now());
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
}

module.exports = { register };
