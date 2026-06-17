const { scheduleSave } = require('../store');
const { findMessage, emitToScope } = require('../realtime');

// ==========================================
// REACCIONES SINCRONIZADAS + BORRADO
// ==========================================
// Ventana para editar/borrar mensajes propios (el cliente la espeja en chat.ts)
const EDIT_DELETE_WINDOW_MS = 15 * 60 * 1000;
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
        const hadIt = (message.reactions[reaction] || []).includes(socket.userId);
        // Regla: UNA reacción por usuario por mensaje. Se quita de todas y,
        // si no era la misma que ya tenía, se aplica la nueva (toggle).
        for (const rid of Object.keys(message.reactions)) {
            message.reactions[rid] = message.reactions[rid].filter(u => u !== socket.userId);
            if (message.reactions[rid].length === 0) delete message.reactions[rid];
        }
        if (!hadIt) {
            message.reactions[reaction] = [...(message.reactions[reaction] || []), socket.userId];
        }
        scheduleSave();
        emitToScope(scope, 'reaction updated', { scope, msgId, reactions: message.reactions });
    });

    // ==========================================
    // EDITAR MENSAJES (solo el autor, solo texto)
    // ==========================================
    socket.on('edit message', (payload) => {
        if (!socket.userId) return;
        const scope = payload?.scope || 'lobby';
        const msgId = payload?.msgId;
        const text = typeof payload?.text === 'string' ? payload.text.trim().substring(0, 2000) : '';
        if (!msgId || !text) return;
        if (scope !== 'lobby') {
            const parts = scope.split('|');
            if (!parts.includes(socket.userId)) return;
        }
        const message = findMessage(scope, msgId);
        if (!message || message.deleted) return;
        if (message.userId !== socket.userId) {
            socket.emit('error toast', { message: 'Solo puedes editar tus propios mensajes.' });
            return;
        }
        if (Date.now() - message.timestamp > EDIT_DELETE_WINDOW_MS) {
            socket.emit('error toast', { message: 'Ya no se puede editar: pasaron más de 15 minutos.' });
            return;
        }
        const hasMedia = (message.imageUrls && message.imageUrls.length > 0) || message.audioUrl;
        if (hasMedia || message.kind === 'sticker') return;
        message.text = text;
        message.edited = true;
        message.editedAt = Date.now();
        scheduleSave();
        emitToScope(scope, 'message edited', { scope, msgId, text, edited: true });
    });

    // ==========================================
    // BORRAR MENSAJES (solo el autor puede)
    // ==========================================
    socket.on('delete message', (payload) => {
        if (!socket.userId) return;
        const scope = payload?.scope || 'lobby';
        const msgId = payload?.msgId ?? payload; // compatibilidad con clientes viejos
        if (scope !== 'lobby') {
            const parts = scope.split('|');
            if (!parts.includes(socket.userId)) return;
        }
        const message = findMessage(scope, msgId);
        if (!message) return;
        if (message.userId !== socket.userId) {
            socket.emit('error toast', { message: 'Solo puedes borrar tus propios mensajes.' });
            return;
        }
        if (Date.now() - message.timestamp > EDIT_DELETE_WINDOW_MS) {
            socket.emit('error toast', { message: 'Ya no se puede borrar: pasaron más de 15 minutos.' });
            return;
        }
        // Tombstone: el mensaje no se elimina del array (los clientes mantienen
        // el layout y el scroll); solo se vacía su contenido.
        message.deleted = true;
        message.text = '';
        message.imageUrls = [];
        message.audioUrl = null;
        message.reactions = {};
        message.replyTo = null;
        message.linkPreview = null;
        scheduleSave();
        emitToScope(scope, 'message deleted', { scope, msgId });
    });
}

module.exports = { register };
