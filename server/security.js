// ==========================================
// SEGURIDAD: cabeceras HTTP estrictas y rate limiting
// Sin dependencias externas: middlewares ligeros propios.
// ==========================================

const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Cabeceras de seguridad para todas las respuestas HTTP.
 * La CSP permite: Google Fonts (estilos del frontend), data:/blob: para
 * avatares y audio local, y ws/wss para Socket.IO.
 */
function securityHeaders(req, res, next) {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader(
        'Content-Security-Policy',
        [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com data:",
            "img-src 'self' data: blob: https:", // https: para imágenes de link previews
            "media-src 'self' blob:",
            "connect-src 'self' ws: wss: https://fonts.googleapis.com https://fonts.gstatic.com",
            "worker-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "frame-ancestors 'none'"
        ].join('; ')
    );
    // HSTS solo en producción (detrás de TLS); en localhost rompería http://
    if (IS_PROD) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
}

/**
 * Rate limiter por IP para rutas Express (ventana fija, en memoria).
 * Uso: app.post('/ruta', makeHttpRateLimiter({ windowMs, max }), handler)
 */
function makeHttpRateLimiter({ windowMs = 60000, max = 30, message = 'Demasiadas peticiones. Espera un momento.' } = {}) {
    const hits = new Map(); // ip -> { count, windowStart }
    // Purga periódica para que el Map no crezca sin límite
    setInterval(() => {
        const now = Date.now();
        for (const [ip, entry] of hits) {
            if (now - entry.windowStart > windowMs * 2) hits.delete(ip);
        }
    }, windowMs * 5).unref();

    return (req, res, next) => {
        const ip = req.ip || req.socket?.remoteAddress || 'unknown';
        const now = Date.now();
        const entry = hits.get(ip) || { count: 0, windowStart: now };
        if (now - entry.windowStart > windowMs) {
            entry.count = 0;
            entry.windowStart = now;
        }
        entry.count++;
        hits.set(ip, entry);
        if (entry.count > max) {
            res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
            return res.status(429).json({ error: message });
        }
        next();
    };
}

/**
 * Rate limiter por socket (eventos de Socket.IO). Devuelve true si se permite.
 * Uso: const limiter = makeSocketRateLimiter({ windowMs, max });
 *      if (!limiter(socket)) return;
 */
function makeSocketRateLimiter({ windowMs = 10000, max = 20 } = {}) {
    const hits = new Map(); // socket.id -> { count, windowStart }
    setInterval(() => {
        const now = Date.now();
        for (const [id, entry] of hits) {
            if (now - entry.windowStart > windowMs * 2) hits.delete(id);
        }
    }, windowMs * 5).unref();

    return (socket) => {
        const now = Date.now();
        const entry = hits.get(socket.id) || { count: 0, windowStart: now };
        if (now - entry.windowStart > windowMs) {
            entry.count = 0;
            entry.windowStart = now;
        }
        entry.count++;
        hits.set(socket.id, entry);
        return entry.count <= max;
    };
}

module.exports = {
    securityHeaders,
    makeHttpRateLimiter,
    makeSocketRateLimiter
};
