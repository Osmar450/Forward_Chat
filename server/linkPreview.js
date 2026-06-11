const { logger } = require('./logger');

// ==========================================
// RICH LINK PREVIEWS (OpenGraph)
// Descarga acotada y segura de metadatos de URLs en mensajes.
// ==========================================

const FETCH_TIMEOUT_MS = 5000;
const MAX_HTML_BYTES = 512 * 1024; // solo necesitamos el <head>
const MAX_FIELD = 300;

const URL_REGEX = /https?:\/\/[^\s<>"']+/i;

// Caché en memoria con TTL: la misma URL no se vuelve a pedir en 1h
const previewCache = new Map(); // url -> { preview|null, at }
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 500;

/** Anti-SSRF: solo http(s) hacia hosts públicos con nombre (nunca IPs/localhost). */
function isSafeUrl(raw) {
    let url;
    try {
        url = new URL(raw);
    } catch {
        return false;
    }
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
    // IP literales (v4 o v6): fuera. Solo dominios con TLD.
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
    if (host.includes(':') || host.startsWith('[')) return false;
    if (!host.includes('.')) return false;
    return true;
}

function extractFirstUrl(text) {
    if (typeof text !== 'string') return null;
    const match = text.match(URL_REGEX);
    if (!match) return null;
    // Limpiar puntuación de cierre pegada a la URL
    return match[0].replace(/[)\].,;!?]+$/, '');
}

function decodeEntities(s) {
    return s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function metaContent(html, patterns) {
    for (const name of patterns) {
        // <meta property="og:title" content="..."> en cualquier orden de atributos
        const re = new RegExp(
            `<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`,
            'i'
        );
        const m = html.match(re);
        const value = m && (m[1] || m[2]);
        if (value) return decodeEntities(value).trim().substring(0, MAX_FIELD);
    }
    return null;
}

async function fetchHtmlHead(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            redirect: 'follow',
            headers: {
                'User-Agent': 'ForwardChatBot/1.0 (+link-preview)',
                Accept: 'text/html'
            }
        });
        if (!res.ok) return null;
        const type = res.headers.get('content-type') || '';
        if (!type.includes('text/html')) return null;
        // Leer como máximo MAX_HTML_BYTES
        const reader = res.body.getReader();
        const chunks = [];
        let received = 0;
        while (received < MAX_HTML_BYTES) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.length;
        }
        controller.abort(); // cortar el resto del cuerpo
        return Buffer.concat(chunks).toString('utf8');
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Devuelve { url, title, description, image, siteName } o null.
 * Nunca lanza: los fallos se degradan a "sin preview".
 */
async function fetchLinkPreview(rawUrl) {
    if (!isSafeUrl(rawUrl)) return null;

    const cached = previewCache.get(rawUrl);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.preview;

    let preview = null;
    try {
        const html = await fetchHtmlHead(rawUrl);
        if (html) {
            const title = metaContent(html, ['og:title', 'twitter:title'])
                || decodeEntities((html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '')).trim().substring(0, MAX_FIELD)
                || null;
            const description = metaContent(html, ['og:description', 'twitter:description', 'description']);
            let image = metaContent(html, ['og:image', 'twitter:image']);
            if (image) {
                try {
                    image = new URL(image, rawUrl).href; // resolver relativas
                    if (!image.startsWith('https://') && !image.startsWith('http://')) image = null;
                } catch {
                    image = null;
                }
            }
            const siteName = metaContent(html, ['og:site_name']) || new URL(rawUrl).hostname.replace(/^www\./, '');
            if (title) preview = { url: rawUrl, title, description, image, siteName };
        }
    } catch (error) {
        logger.warn('Link preview falló', { url: rawUrl, error });
    }

    if (previewCache.size >= CACHE_MAX) {
        previewCache.delete(previewCache.keys().next().value);
    }
    previewCache.set(rawUrl, { preview, at: Date.now() });
    return preview;
}

module.exports = { fetchLinkPreview, extractFirstUrl, isSafeUrl };
