import { AnimatePresence, motion } from "motion/react";
import { Info, Instagram, MessageSquare, ShieldCheck, Timer } from "lucide-react";
import type { ThemeTokens } from "../../lib/themes";
import { CloseButton } from "../common/CloseButton";

const CREATORS = [
  { handle: "ForwardTecno", url: "https://www.instagram.com/forwardtecno?igsh=OWliNWt5MzJqOXZr" },
  { handle: "Lillian_885", url: "https://www.instagram.com/lillian_885_?igsh=MTlsNHJ1aWtrcWlzcA==" },
];

/** "Acerca de Forward_Code": descripción, privacidad y enlaces a creadores. */
export function AboutModal({ open, theme: t, onClose }: { open: boolean; theme: ThemeTokens; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[55] flex items-start md:items-center justify-center p-3 pt-14 md:p-3 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: -40, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -40, opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-md ${t.panel} border ${t.borderStrong} rounded-2xl p-5 shadow-2xl max-h-[85dvh] overflow-y-auto`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Info className={`size-5 ${t.accentText}`} />
                <span>Acerca de Forward_Code</span>
              </div>
              <CloseButton onClick={onClose} className={`${t.iconBtn} border shadow-sm`} size="small" />
            </div>

            <div className={`flex items-center gap-3 mb-4`}>
              <div className={`size-12 rounded-2xl ${t.accent} flex items-center justify-center text-white shadow-lg shrink-0`}>
                <MessageSquare className="size-6" />
              </div>
              <div className="min-w-0">
                <div className="font-display text-sm">Forward_Code</div>
                <div className={`text-xs ${t.textMuted}`}>Mensajería en tiempo real · v3.1</div>
              </div>
            </div>

            <p className={`text-sm leading-relaxed ${t.text}`}>
              Forward_Code es una app de mensajería con lobby público, chats privados por Forward Token,
              llamadas de voz y video, y ForwardBot IA.
            </p>

            <div className={`mt-3 flex items-start gap-2 p-3 rounded-xl ${t.accentSoft} border ${t.border}`}>
              <Timer className={`size-4 shrink-0 mt-0.5 ${t.accentText}`} />
              <span className={`text-[12px] leading-relaxed ${t.text}`}>
                <b>Privacidad:</b> todos los mensajes se eliminan automáticamente cada <b>48 horas</b>.
                Nada se guarda para siempre.
              </span>
            </div>
            <div className={`mt-2 flex items-center gap-2 text-[11px] ${t.textMuted}`}>
              <ShieldCheck className="size-3.5" /> Entradas saneadas y conexiones cifradas por el túnel.
            </div>

            <div className={`text-[10px] font-pixel-ui tracking-widest ${t.textMuted} mt-5 mb-2`}>CREADORES</div>
            <div className="space-y-2">
              {CREATORS.map((c) => (
                <a
                  key={c.handle}
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl ${t.inputBg} border ${t.border} hover:opacity-85 transition-opacity`}
                >
                  <span className="size-9 rounded-lg flex items-center justify-center text-white shadow-md shrink-0" style={{ background: "linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)" }}>
                    <Instagram className="size-5" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="text-sm block">@{c.handle}</span>
                    <span className={`text-[11px] ${t.textMuted} truncate block`}>Instagram</span>
                  </span>
                </a>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
