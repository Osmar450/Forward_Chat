import { motion } from "motion/react";
import { Pause, Play, Send, Trash2 } from "lucide-react";
import type { ThemeTokens } from "../../lib/themes";
import { fmtTime } from "../../lib/chat";

/**
 * Barra de grabación de nota de voz (reemplaza al composer mientras se graba):
 * timer en vivo, indicador pulsante, pausa/reanudación, cancelar y enviar.
 * En pausa la onda se congela y el indicador pasa a ámbar fijo.
 */
export function RecorderBar({
  theme: t,
  seconds,
  paused,
  onTogglePause,
  onCancel,
  onSend,
}: {
  theme: ThemeTokens;
  seconds: number;
  paused: boolean;
  onTogglePause: () => void;
  onCancel: () => void;
  onSend: () => void;
}) {
  return (
    <motion.div
      key="recorder"
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 20, opacity: 0 }}
      transition={{ type: "spring", stiffness: 350, damping: 26 }}
      className="flex items-center gap-2 p-3"
    >
      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.9 }}
        onClick={onCancel}
        className={`p-3 rounded-xl ${t.danger} text-white shadow-lg`}
        aria-label="Cancelar grabación"
      >
        <Trash2 className="size-5" />
      </motion.button>

      <div className={`flex-1 min-w-0 flex items-center gap-2.5 ${t.inputBg} border ${t.border} rounded-xl px-3 py-2.5`}>
        <motion.span
          animate={paused ? { scale: 1, opacity: 1 } : { scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
          transition={paused ? { duration: 0.2 } : { duration: 1, repeat: Infinity }}
          className={`size-2.5 rounded-full shrink-0 ${paused ? "bg-amber-400" : "bg-red-500"}`}
          aria-hidden="true"
        />
        <span className="tabular-nums text-sm shrink-0" aria-live="polite">
          {fmtTime(seconds)}
        </span>
        <div className="flex-1 flex items-center justify-center gap-0.5 h-6 min-w-0" aria-hidden="true">
          {Array.from({ length: 18 }).map((_, i) => (
            <motion.span
              key={i}
              animate={paused ? { scaleY: 0.3, opacity: 0.5 } : { scaleY: [0.3, 1, 0.3], opacity: 1 }}
              transition={
                paused
                  ? { duration: 0.25, ease: "easeOut" }
                  : {
                      duration: 0.6 + (i % 5) * 0.15,
                      repeat: Infinity,
                      delay: (i % 7) * 0.05,
                      ease: "easeInOut",
                    }
              }
              className="w-0.5 h-full rounded-full"
              style={{ backgroundColor: t.accentHex }}
            />
          ))}
        </div>
        {paused && (
          <span className={`shrink-0 text-[9px] font-pixel-ui tracking-widest ${t.textMuted}`}>EN PAUSA</span>
        )}
      </div>

      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.9 }}
        onClick={onTogglePause}
        className={`p-3 rounded-xl border ${t.borderStrong} ${t.iconBtn} shadow-lg`}
        aria-label={paused ? "Reanudar grabación" : "Pausar grabación"}
      >
        {paused ? <Play className={`size-5 ${t.accentText}`} fill="currentColor" /> : <Pause className={`size-5 ${t.accentText}`} fill="currentColor" />}
      </motion.button>

      <motion.button
        whileHover={{ scale: 1.08, rotate: -8 }}
        whileTap={{ scale: 0.85 }}
        onClick={onSend}
        className={`p-3 rounded-xl ${t.accent} ${t.accentHover} text-white shadow-lg`}
        aria-label="Enviar audio"
      >
        <Send className="size-5" />
      </motion.button>
    </motion.div>
  );
}
