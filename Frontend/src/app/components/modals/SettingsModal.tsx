import { AnimatePresence, motion } from "motion/react";
import { Bell, Leaf, Mic, Rocket, Settings, ShieldAlert, Trash2, Video } from "lucide-react";
import type { ThemeTokens } from "../../lib/themes";
import { CloseButton } from "../common/CloseButton";

function Toggle({ icon, label, hint, enabled, onToggle, theme: t }: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  enabled: boolean;
  onToggle: () => void;
  theme: ThemeTokens;
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl ${t.inputBg} border ${t.border} text-left transition-colors`}
      role="switch"
      aria-checked={enabled}
      aria-label={`${label}: ${enabled ? "activado" : "desactivado"}`}
    >
      <span className={enabled ? t.accentText : t.textMuted}>{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="text-sm block">{label}</span>
        {hint && <span className={`text-[11px] ${t.textMuted}`}>{hint}</span>}
      </span>
      <span className={`w-11 h-6 rounded-full p-0.5 flex items-center shrink-0 transition-colors ${enabled ? `${t.accent} justify-end` : "bg-white/15 justify-start"}`}>
        <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 30 }} className="size-5 rounded-full bg-white shadow" />
      </span>
    </button>
  );
}

/** Pantalla de Ajustes: permisos, modo eco y limpieza de chat. */
export function SettingsModal({
  open,
  theme: t,
  perms,
  ecoMode,
  warnOnDelete,
  onToggleWarnOnDelete,
  onToggleMic,
  onToggleCam,
  onToggleNotif,
  onToggleEco,
  onClearChat,
  onClose,
}: {
  open: boolean;
  theme: ThemeTokens;
  perms: { mic: boolean; cam: boolean; notif: boolean };
  ecoMode: boolean;
  warnOnDelete: boolean;
  onToggleWarnOnDelete: () => void;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleNotif: () => void;
  onToggleEco: () => void;
  onClearChat: () => void;
  onClose: () => void;
}) {
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
                <Settings className={`size-5 ${t.accentText}`} />
                <span>Ajustes</span>
              </div>
              <CloseButton onClick={onClose} className={`${t.iconBtn} border shadow-sm`} size="small" />
            </div>

            <div className={`text-[10px] font-pixel-ui tracking-widest ${t.textMuted} mb-2`}>PERMISOS</div>
            <div className="space-y-2">
              <Toggle theme={t} icon={<Mic className="size-5" />} label="Micrófono" hint="Para llamadas de voz y notas" enabled={perms.mic} onToggle={onToggleMic} />
              <Toggle theme={t} icon={<Video className="size-5" />} label="Cámara" hint="Para videollamadas" enabled={perms.cam} onToggle={onToggleCam} />
              <Toggle theme={t} icon={<Bell className="size-5" />} label="Notificaciones" hint="Avisos de mensajes y llamadas" enabled={perms.notif} onToggle={onToggleNotif} />
            </div>
            <div className={`mt-3 p-3 rounded-xl ${t.accentSoft} border ${t.border} flex items-start gap-2`}>
              <Rocket className={`size-4 shrink-0 mt-0.5 ${t.accentText}`} />
              <span className={`text-[11px] leading-relaxed ${t.textMuted}`}>
                Habilita los permisos necesarios para desbloquear el máximo potencial de la app y disfrutar de una experiencia sin límites.
              </span>
            </div>

            <div className={`text-[10px] font-pixel-ui tracking-widest ${t.textMuted} mt-5 mb-2`}>GENERAL</div>
            <div className="space-y-2">
              <Toggle theme={t} icon={<ShieldAlert className="size-5" />} label="Confirmar antes de borrar" hint="Evita borrar mensajes por accidente" enabled={warnOnDelete} onToggle={onToggleWarnOnDelete} />
              <Toggle theme={t} icon={<Leaf className={`size-5 ${ecoMode ? "text-emerald-400" : ""}`} />} label="Modo Eco" hint="Menos animaciones, ahorra batería" enabled={ecoMode} onToggle={onToggleEco} />
              <button
                onClick={onClearChat}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl ${t.inputBg} border ${t.border} text-left text-red-400`}
              >
                <Trash2 className="size-5" />
                <span className="flex-1 min-w-0">
                  <span className="text-sm block">Limpiar chat local</span>
                  <span className={`text-[11px] ${t.textMuted}`}>Borra los mensajes solo en tu pantalla</span>
                </span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
