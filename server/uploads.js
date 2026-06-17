const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { logger } = require('./logger');

// sharp es opcional: si falta, las imágenes se guardan sin comprimir
let sharp = null;
try {
    sharp = require('sharp');
} catch {
    logger.warn?.('sharp no disponible: las subidas no se comprimirán');
}

// ==========================================
// UPLOADS (imágenes y audios del chat)
// ==========================================
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max (GIF/video pesados)
    fileFilter: (req, file, cb) => {
        const imageTypes = /jpeg|jpg|png|gif|webp|bmp/;
        const audioTypes = /webm|ogg|mp3|wav|m4a|mpeg|mp4/;
        const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
        const isImage = imageTypes.test(ext) || file.mimetype.startsWith('image/');
        const isAudio = audioTypes.test(ext) || file.mimetype.startsWith('audio/');
        if (isImage || isAudio) return cb(null, true);
        cb(new Error('Tipo de archivo no permitido'));
    }
});

const UPLOAD_RATE_LIMITS = new Map();
const MAX_UPLOADS_PER_MINUTE = 6;

// Comprime una imagen ya guardada en disco (incl. GIF animado) y la reemplaza.
// Reduce el peso de GIFs pesados (30MB+) a tamaños web sin perder animación.
async function compressImageFile(filepath, mimetype) {
    if (!sharp || !mimetype.startsWith('image/')) return;
    try {
        const stat = fs.statSync(filepath);
        if (stat.size < 512 * 1024) return; // pequeñas: no vale la pena
        const isGif = mimetype === 'image/gif';
        const input = fs.readFileSync(filepath);
        let pipeline = sharp(input, { animated: isGif, limitInputPixels: 268402689 })
            .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true });
        pipeline = isGif ? pipeline.gif() : pipeline.webp({ quality: 80 });
        const out = await pipeline.toBuffer();
        if (out.length < input.length) {
            fs.writeFileSync(filepath, out);
            logger.debug?.(`Subida comprimida: ${(input.length / 1048576).toFixed(1)}MB -> ${(out.length / 1048576).toFixed(1)}MB`);
        }
    } catch (error) {
        logger.warn?.('No se pudo comprimir la subida', { error });
    }
}

function registerUploadRoutes(app) {
    app.post('/upload', upload.array('files', 10), async (req, res) => {
        const now = Date.now();
        const clientIp = req.ip || req.connection.remoteAddress;
        const uploadRateLimit = UPLOAD_RATE_LIMITS.get(clientIp) || { count: 0, windowStart: now };

        if (now - uploadRateLimit.windowStart > 60000) {
            uploadRateLimit.count = 0;
            uploadRateLimit.windowStart = now;
        }
        if (uploadRateLimit.count >= MAX_UPLOADS_PER_MINUTE) {
            return res.status(429).json({ error: 'Demasiados uploads. Espera un momento.' });
        }
        uploadRateLimit.count++;
        UPLOAD_RATE_LIMITS.set(clientIp, uploadRateLimit);

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No se subieron archivos' });
        }
        // Compresión server-side de imágenes/GIF antes de responder la URL
        await Promise.all(req.files.map(f => compressImageFile(f.path, f.mimetype)));
        const files = req.files.map(f => ({
            url: '/uploads/' + f.filename,
            type: f.mimetype.startsWith('image/') ? 'image' : 'audio',
            originalName: f.originalname
        }));
        res.json({ files });
    });
}

// Limpiar imágenes antiguas generadas por el bot
function startUploadsCleanup() {
    setInterval(() => {
        try {
            const files = fs.readdirSync(uploadsDir);
            const now = Date.now();
            files.forEach(file => {
                if (file.startsWith('bot-gen-')) {
                    const filepath = path.join(uploadsDir, file);
                    if (now - fs.statSync(filepath).mtimeMs > 24 * 60 * 60 * 1000) fs.unlinkSync(filepath);
                }
            });
        } catch (error) {
            logger.error('Error limpiando imágenes antiguas', { error });
        }
    }, 6 * 60 * 60 * 1000);
}

module.exports = {
    uploadsDir,
    registerUploadRoutes,
    startUploadsCleanup
};
