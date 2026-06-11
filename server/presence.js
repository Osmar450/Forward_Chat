// ==========================================
// PRESENCIA EN MEMORIA (multi-socket)
// Un usuario puede tener varias pestañas abiertas.
// Cada socket se une al room "u:<userId>", así la señalización SIEMPRE llega
// aunque haya reconexiones o sockets viejos (la causa de las llamadas perdidas).
// ==========================================
const userSockets = new Map(); // userId -> Set<socketId>

const isOnline = (userId) => userSockets.has(userId);
const userRoom = (userId) => `u:${userId}`;

function addUserSocket(userId, socketId) {
    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId).add(socketId);
}

// Devuelve true si el usuario quedó completamente desconectado
function removeUserSocket(userId, socketId) {
    const set = userSockets.get(userId);
    if (!set) return false;
    set.delete(socketId);
    if (set.size === 0) {
        userSockets.delete(userId);
        return true;
    }
    return false;
}

module.exports = {
    userSockets,
    isOnline,
    userRoom,
    addUserSocket,
    removeUserSocket
};
