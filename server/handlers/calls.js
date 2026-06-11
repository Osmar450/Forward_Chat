const { store } = require('../store');
const { areFriends, dmKey, BOT_ID } = require('../users');
const { isOnline } = require('../presence');
const { emitAll, emitToUser } = require('../realtime');

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
    emitAll('voice participants', { channel, members });
}

function register(io, socket) {
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
}

module.exports = {
    register,
    voiceChannels,
    dmCallPeers,
    broadcastVoiceParticipants
};
