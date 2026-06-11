/**
 * Logger centralizado: solo errores críticos llegan a consola en producción.
 * En desarrollo también se muestran avisos de depuración.
 */
export const logger = {
  debug: (...args: unknown[]) => {
    if (import.meta.env.DEV) console.log("[forward]", ...args);
  },
  error: (...args: unknown[]) => {
    console.error("[forward]", ...args);
  },
};
