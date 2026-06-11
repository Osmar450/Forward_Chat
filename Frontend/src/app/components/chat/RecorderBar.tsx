import { motion } from "motion/react";
import { Send, Trash2 } from "lucide-react";
import type { ThemeTokens } from "../../lib/themes";
import { fmtTime } from "../../lib/chat";

/** Barra de grabación de nota de voz (reemplaza al composer mientras se graba). */
export function RecorderBar({
  theme: t,
  seconds,
  onCancel,
  onSend,
}: {
  theme: ThemeTokens;
  seconds: number;
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
      className="flex items-center gap-3 p-3"
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

      <div className={`flex-1 flex items-center gap-3 ${t.inputBg} border ${t.border} rounded-xl px-4 py-2.5`}>
        <motion.span
          animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
          className="size-2.5 rounded-full bg-red-500"
        />
        <span className="tabular-nums text-sm">{fmtTime(seconds)}</span>
        <div className="flex-1 flex items-center justify-center gap-0.5 h-6">
          {Array.from({ length: 22 }).map((_, i) => (
            <motion.span
              key={i}
              animate={{ scaleY: [0.3, 1, 0.3] }}
              transition={{
                duration: 0.6 + (i % 5) * 0.15,
                repeat: Infinity,
                delay: (i % 7) * 0.05,
                ease: "easeInOut",
              }}
              className="w-0.5 h-full rounded-full"
              style={{ backgroundColor: t.accentHex }}
            />
          ))}
        </div>
      </div>

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
