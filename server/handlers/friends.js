const { store } = require('../store');
const { getOrCreateUser, publicProfile, normalizeCode, areFriends, addFriendship, removeFriendship, findUserByCode, cleanText } = require('../users');
const { isOnline } = require('../presence');
const { emitToUser, sendFriendsList } = require('../realtime');
const { makeSocketRateLimiter } = require('../security');

// ==========================================
// AMIGOS (Friend Token)
// ==========================================
// Anti fuerza bruta de Forward Tokens: pocos intentos por minuto y socket
const addFriendLimiter = makeSocketRateLimiter({ windowMs: 60000, max: 8 });

function register(io, socket) {
    socket.on('add friend', (payload) => {
        if (!socket.userId) return;
        if (!addFriendLimiter(socket)) {
            return socket.emit('friend error', { message: 'Demasiados intentos. Espera un minuto.' });
        }
        const code = normalizeCode(payload?.code);
        if (!code) {
            return socket.emit('friend error', { message: 'Código inválido. El formato es FWD-XXXX-XXXX.' });
        }
        const me = getOrCreateUser(socket.userId);
        if (me.friendCode === code) {
            return socket.emit('friend error', { message: 'Ese es tu propio código, broski. 😅' });
        }
        const target = findUserByCode(code);
        if (!target) {
            return socket.emit('friend error', { message: 'No existe ningún usuario con ese código.' });
        }
        if (areFriends(socket.userId, target.userId)) {
            return socket.emit('friend error', { message: `${target.name} ya es tu amigo.` });
        }
        addFriendship(socket.userId, target.userId);

        socket.emit('friend added', { profile: publicProfile(target, isOnline(target.userId)) });
        emitToUser(target.userId, 'friend added', { profile: publicProfile(me, true) });
        sendFriendsList(socket.userId);
        sendFriendsList(target.userId);
        console.log(`🤝 Nueva amistad: ${me.name} + ${target.name}`);
    });

    socket.on('remove friend', (payload) => {
        if (!socket.userId || !payload?.userId) return;
        const other = payload.userId;
        if (removeFriendship(socket.userId, other)) {
            sendFriendsList(socket.userId);
            sendFriendsList(other);
        }
    });

    // Apodo: el cliente A guarda el apodo localmente y notifica a B en tiempo real
    socket.on('set nickname', (payload) => {
        if (!socket.userId || !payload?.to) return;
        const target = payload.to;
        if (target === socket.userId || !store.users[target]) return;
        const nickname = cleanText(payload.nickname, 24);
        if (!nickname) return;
        const me = getOrCreateUser(socket.userId);
        emitToUser(target, 'nickname assigned', {
            from: socket.userId,
            fromName: me.name,
            nickname,
        });
    });
}

module.exports = { register };
