const { store, scheduleSave } = require('../store');
const { getOrCreateUser, publicProfile, generateAnonymousId, sanitizeMedia, friendIdsOf, BOT_PROFILE } = require('../users');
const { addUserSocket, removeUserSocket } = require('../presence');
const { emitAll, emitToUser, broadcastPresence, sendFriendsList } = require('../realtime');
const { voiceChannels, dmCallPeers, broadcastVoiceParticipants } = require('./calls');
const { messageRateLimits } = require('./messages');

// ==========================================
// SESIÓN: restaurar/crear perfil, presencia y desconexión
// ==========================================
function register(io, socket) {
    const finalizeSession = (user) => {
        socket.userId = user.userId;
        addUserSocket(user.userId, socket.id);
        socket.join(`u:${user.userId}`);

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

        emitAll('profile updated', publicProfile(user, true));
        broadcastPresence();
        // Avisar a sus amigos para refrescar su lista
        friendIdsOf(socket.userId).forEach(fid => sendFriendsList(fid));
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
