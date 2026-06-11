import { AnimatePresence, motion } from "motion/react";
import { Check, Moon, Palette, Sun } from "lucide-react";
import { themes, Theme, ThemeTokens, LIGHT_THEMES, DARK_THEMES } from "../../lib/themes";
import { CloseButton } from "../common/CloseButton";

/** Selector de modo claro/oscuro y tema de color. */
export function ThemesModal({
  open,
  theme,
  themeTokens: t,
  onSetTheme,
  onClose,
}: {
  open: boolean;
  theme: Theme;
  themeTokens: ThemeTokens;
  onSetTheme: (theme: Theme) => void;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-40 flex items-start md:items-center justify-center p-3 pt-20 md:p-3 bg-black/70 backdrop-blur-sm"
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
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Palette className={`size-5 ${t.accentText}`} />
                <span>Temas</span>
              </div>
              <CloseButton onClick={onClose} className={`${t.iconBtn} border shadow-sm`} size="small" />
            </div>

            <div className={`text-xs ${t.textMuted} tracking-widest mb-2`}>MODO</div>
            <div className={`grid grid-cols-2 gap-2 p-1 rounded-xl ${t.inputBg} border ${t.border} mb-5`}>
              {[
                { key: "light" as Theme, icon: <Sun className="size-4" />, label: "Claro" },
                { key: "dark" as Theme, icon: <Moon className="size-4" />, label: "Oscuro" },
              ].map((m) => {
                const selected = theme === m.key;
                return (
                  <motion.button
                    key={m.key}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => onSetTheme(m.key)}
                    className={`relative flex items-center justify-center gap-2 py-2.5 rounded-lg transition-colors ${
                      selected ? `${t.accent} text-white shadow-md` : `${t.text} hover:bg-white/5`
                    }`}
                  >
                    {m.icon}
                    <span className="text-sm">{m.label}</span>
                  </motion.button>
                );
              })}
            </div>

            <div className={`text-xs ${t.textMuted} tracking-widest mb-2 font-pixel-ui`}>
              TEMAS {t.isLight ? "CLAROS" : "OSCUROS"}
            </div>
            <motion.div
              key={t.isLight ? "light-grid" : "dark-grid"}
              className="grid grid-cols-2 gap-3"
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } } }}
            >
              {(t.isLight ? LIGHT_THEMES : DARK_THEMES).map((key) => {
                const opt = themes[key];
                const selected = key === theme;
                return (
                  <motion.button
                    key={key}
                    variants={{
                      hidden: { opacity: 0, y: 16, scale: 0.9 },
                      show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 300, damping: 22 } },
                    }}
                    whileHover={{ y: -3, scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => onSetTheme(key)}
                    className={`relative p-3 rounded-xl border-2 transition-all text-left pixel-chip ${
                      selected ? opt.borderStrong : t.border
                    } ${t.inputBg}`}
                  >
                    <div className={`relative h-20 rounded-lg overflow-hidden ${opt.preview.bg} p-2 flex flex-col justify-between mb-2`}>
                      <div className="flex items-center gap-1">
                        <div className={`size-2.5 rounded-full ${opt.preview.bubbleA}`} />
                        <div className={`h-2 w-10 rounded-full ${opt.preview.bubbleB}`} />
                      </div>
                      <div className="flex flex-col gap-1 items-end">
                        <div className={`h-2 w-14 rounded-full ${opt.preview.bubbleC}`} />
                        <div className={`h-2 w-8 rounded-full ${opt.preview.bubbleA}`} />
                      </div>
                      {selected && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 400, damping: 18 }}
                          className={`absolute top-1.5 right-1.5 size-6 rounded-full ${opt.accent} flex items-center justify-center shadow-md`}
                        >
                          <Check className="size-3.5 text-white" strokeWidth={3} />
                        </motion.div>
                      )}
                    </div>
                    <div className="text-sm">{opt.name}</div>
                  </motion.button>
                );
              })}
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
