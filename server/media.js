const { logger } = require('./logger');

// sharp es opcional: si no está disponible, el banner se guarda sin comprimir
let sharp = null;
try {
    sharp = require('sharp');
} catch {
    logger.warn?.('sharp no disponible: los banners no se comprimirán en el servidor');
}

const DATAURL_RE = /^data:([\w/+.-]+);base64,(.+)$/;

/**
 * Comprime un banner recibido como data URL para evitar saturar el servidor.
 * - Imágenes (incluido GIF animado): se redimensionan a 1280px y se recomprimen
 *   con sharp manteniendo la animación (animated: true).
 * - Video u otros tipos: se devuelven tal cual (requerirían ffmpeg).
 * Si algo falla, devuelve el original (nunca rompe el guardado del perfil).
 */
async function compressBannerDataUrl(dataUrl) {
    if (!sharp || typeof dataUrl !== 'string') return dataUrl;
    const m = dataUrl.match(DATAURL_RE);
    if (!m) return dataUrl;
    const mime = m[1].toLowerCase();
    if (!mime.startsWith('image/')) return dataUrl; // video: sin transcodificar

    try {
        const input = Buffer.from(m[2], 'base64');
        const isGif = mime === 'image/gif';
        let pipeline = sharp(input, { animated: isGif, limitInputPixels: 268402689 })
            .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true });

        let outMime = mime;
        if (isGif) {
            pipeline = pipeline.gif();
        } else {
            pipeline = pipeline.webp({ quality: 80 });
            outMime = 'image/webp';
        }
        const out = await pipeline.toBuffer();
        // Si la compresión no ayudó, conservar el original
        if (out.length >= input.length) return dataUrl;
        logger.debug?.(`Banner comprimido: ${(input.length / 1024 / 1024).toFixed(1)}MB -> ${(out.length / 1024 / 1024).toFixed(1)}MB`);
        return `data:${outMime};base64,${out.toString('base64')}`;
    } catch (error) {
        logger.warn?.('No se pudo comprimir el banner', { error });
        return dataUrl;
    }
}

module.exports = { compressBannerDataUrl };
