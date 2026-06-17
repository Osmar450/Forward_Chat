// ==========================================
// LOGGER CENTRALIZADO Y SENSIBLE AL ENTORNO
// - development: salida legible para humanos en consola.
// - production: JSON por línea (ingestable por Sentry/Datadog/CloudWatch),
//   sin filtrar stack traces hacia el cliente (eso lo garantiza el error
//   handler de index.js, que responde mensajes genéricos).
// ==========================================

const IS_PROD = process.env.NODE_ENV === 'production';

function serializeError(err) {
    if (!err) return undefined;
    if (err instanceof Error) {
        return { name: err.name, message: err.message, stack: err.stack };
    }
    return { name: 'NonError', message: String(err) };
}

function emit(level, message, context) {
    if (IS_PROD) {
        // Una línea JSON por evento: APM-friendly
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            service: 'forward-chat',
            message,
            ...(context && Object.keys(context).length ? { context } : {})
        };
        if (context?.error) entry.error = serializeError(context.error);
        if (entry.context?.error) delete entry.context.error;
        process.stdout.write(JSON.stringify(entry) + '\n');
    } else {
        const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
        if (context?.error) fn(`[${level}] ${message}`, context.error);
        else fn(`[${level}] ${message}`, context || '');
    }
}

const logger = {
    info: (message, context) => emit('info', message, context),
    warn: (message, context) => emit('warn', message, context),
    error: (message, context) => emit('error', message, context),

    /** Error handler de Express: log completo en servidor, respuesta genérica al cliente. */
    expressErrorHandler() {
        // eslint-disable-next-line no-unused-vars
        return (err, req, res, next) => {
            emit('error', 'Unhandled HTTP error', {
                error: err,
                method: req.method,
                path: req.path,
                status: err.status || 500
            });
            if (res.headersSent) return;
            res.status(err.status || 500).json({
                error: IS_PROD ? 'Error interno del servidor.' : err.message
            });
        };
    },

    /** Captura fallos de proceso para que siempre queden registrados. */
    registerProcessHandlers() {
        process.on('unhandledRejection', (reason) => {
            emit('error', 'Unhandled promise rejection', { error: reason });
        });
        process.on('uncaughtException', (err) => {
            emit('error', 'Uncaught exception', { error: err });
            // Estado potencialmente corrupto: salir y dejar que el orquestador reinicie
            process.exit(1);
        });
    }
};

module.exports = { logger };
