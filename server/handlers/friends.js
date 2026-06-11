const { store, scheduleSave } = require('../store');
const { getOrCreateUser, publicProfile, normalizeCode, areFriends } = require('../users');
const { isOnline } = require('../presence');
const { emitToUser, sendFriendsList } = require('../realtime');

// ==========================================
// AMIGOS (Friend Token)
// ==========================================
function register(io, socket) {
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
}

module.exports = { register };
