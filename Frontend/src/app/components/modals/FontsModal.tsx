import { AnimatePresence, motion } from "motion/react";
import { Check, Type } from "lucide-react";
import type { ThemeTokens } from "../../lib/themes";
import { CHAT_FONTS, ChatFontKey } from "../../lib/chat";
import { CloseButton } from "../common/CloseButton";

/** Selector de tipografía para el texto de las burbujas del chat. */
export function FontsModal({
  open,
  theme: t,
  current,
  onSelect,
  onClose,
}: {
  open: boolean;
  theme: ThemeTokens;
  current: ChatFontKey;
  onSelect: (key: ChatFontKey) => void;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-40 flex items-start md:items-center justify-center p-3 pt-16 md:p-3 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: -60, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -60, opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-md ${t.panel} border ${t.borderStrong} rounded-2xl p-5 shadow-2xl max-h-[85dvh] overflow-y-auto`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Type className={`size-5 ${t.accentText}`} />
                <span>Fuentes</span>
              </div>
              <CloseButton onClick={onClose} className={`${t.iconBtn} border shadow-sm`} size="small" />
            </div>
            <div className={`text-xs ${t.textMuted} mb-4`}>Tipografía del texto de los mensajes</div>

            <div className="space-y-2">
              {CHAT_FONTS.map((f) => {
                const selected = f.key === current;
                return (
                  <motion.button
                    key={f.key}
                    whileHover={{ x: 3 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onSelect(f.key)}
                    className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-colors ${
                      selected ? `${t.borderStrong} ${t.accentSoft}` : `${t.border} ${t.inputBg}`
                    }`}
                    aria-pressed={selected}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm flex items-center gap-2">
                          {f.label}
                          <span className={`text-[10px] ${t.textMuted}`}>{f.hint}</span>
                        </div>
                        <div
                          className={`mt-1 text-[15px] leading-snug truncate ${t.text}`}
                          style={{ fontFamily: f.family }}
                        >
                          ¡Qué onda! Así se ven tus mensajes 123
                        </div>
                      </div>
                      {selected && <Check className={`size-4 shrink-0 ${t.accentText}`} />}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
