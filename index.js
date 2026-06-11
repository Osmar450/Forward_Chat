const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const dotenv = require('dotenv');

// Cargar variables de entorno ANTES de los módulos que las leen (bot/Gemini)
dotenv.config();

const { saveNow, startRetentionCleanup } = require('./server/store');
const realtime = require('./server/realtime');
const { registerUploadRoutes, startUploadsCleanup, uploadsDir } = require('./server/uploads');
const { logBotConfig } = require('./server/bot');
const sessionHandlers = require('./server/handlers/session');
const friendHandlers = require('./server/handlers/friends');
const messageHandlers = require('./server/handlers/messages');
const reactionHandlers = require('./server/handlers/reactions');
const callHandlers = require('./server/handlers/calls');

// ==========================================
// EXPRESS + SOCKET.IO
// ==========================================
const app = express();
app.use(cors()); // Permitir conexiones desde Vite

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' },
    maxHttpBufferSize: 10e6
});
realtime.init(io);

logBotConfig();

// Archivos estáticos y uploads
app.use(express.static(path.join(__dirname, 'Frontend', 'dist')));
app.use('/uploads', express.static(uploadsDir));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
registerUploadRoutes(app);

// Tareas periódicas (retención de mensajes e imágenes del bot)
startRetentionCleanup();
startUploadsCleanup();

// ==========================================
// SOCKET.IO: cada dominio registra sus handlers
// ==========================================
io.on('connection', (socket) => {
    console.log('Usuario conectado:', socket.id);
    sessionHandlers.register(io, socket);
    friendHandlers.register(io, socket);
    messageHandlers.register(io, socket);
    reactionHandlers.register(io, socket);
    callHandlers.register(io, socket);
});

// SPA fallback (rutas del frontend)
app.get(/^\/(?!uploads|assets|upload).*/, (req, res, next) => {
    const indexFile = path.join(__dirname, 'Frontend', 'dist', 'index.html');
    if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
    next();
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

// Guardar datos al cerrar
process.on('SIGINT', () => {
    try {
        saveNow();
        console.log('💾 Datos guardados. ¡Adiós!');
    } catch { /* ignorar */ }
    process.exit(0);
});
