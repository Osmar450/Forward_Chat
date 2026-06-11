const { store, scheduleSave, MAX_DM_MESSAGES } = require('./store');
const { publicProfile, friendIdsOf, BOT_PROFILE } = require('./users');
const { userSockets, isOnline, userRoom } = require('./presence');

// ==========================================
// HELPERS DE EMISIÓN
// Se inicializa con la instancia de socket.io desde index.js.
// ==========================================
let io = null;
function init(_io) {
    io = _io;
}

function emitAll(event, payload) {
    io.emit(event, payload);
}

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

module.exports = {
    init,
    emitAll,
    emitToUser,
    broadcastPresence,
    sendFriendsList,
    findMessage,
    scopeRecipients,
    emitToScope,
    storeAndEmit
};
