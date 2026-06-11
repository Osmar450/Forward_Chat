const { scheduleSave } = require('../store');
const { findMessage, emitToScope } = require('../realtime');

// ==========================================
// REACCIONES SINCRONIZADAS + BORRADO
// ==========================================
function register(io, socket) {
    socket.on('reaction', (payload) => {
        if (!socket.userId) return;
        const { scope, msgId, reaction } = payload || {};
        if (!scope || !msgId || !reaction || typeof reaction !== 'string' || reaction.length > 16) return;
        // Validar acceso al scope
        if (scope !== 'lobby') {
            const parts = scope.split('|');
            if (!parts.includes(socket.userId)) return;
        }
        const message = findMessage(scope, msgId);
        if (!message) return;
        if (!message.reactions) message.reactions = {};
        const users = message.reactions[reaction] || [];
        if (users.includes(socket.userId)) {
            message.reactions[reaction] = users.filter(u => u !== socket.userId);
            if (message.reactions[reaction].length === 0) delete message.reactions[reaction];
        } else {
            message.reactions[reaction] = [...users, socket.userId];
        }
        scheduleSave();
        emitToScope(scope, 'reaction updated', { scope, msgId, reactions: message.reactions });
    });

    // ==========================================
    // BORRAR MENSAJES (solo el autor puede)
    // ==========================================
    socket.on('delete message', (payload) => {
        if (!socket.userId) return;
        const scope = payload?.scope || 'lobby';
        const msgId = payload?.msgId ?? payload; // compatibilidad con clientes viejos
        const message = findMessage(scope, msgId);
        if (!message) return;
        if (message.userId !== socket.userId) {
            socket.emit('error toast', { message: 'Solo puedes borrar tus propios mensajes.' });
            return;
        }
        message.deleted = true;
        message.text = '';
        message.imageUrls = [];
        message.audioUrl = null;
        scheduleSave();
        emitToScope(scope, 'message deleted', { scope, msgId });
    });
}

module.exports = { register };
