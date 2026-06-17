import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Copy, Info, KeyRound, Palette, Pencil, Settings, Type, User, UserPlus, Wifi, WifiOff } from "lucide-react";
import type { ThemeTokens } from "../../lib/themes";
import { Participant, STATUSES } from "../../lib/chat";
import { CloseButton } from "../common/CloseButton";
import { BannerMedia } from "../common/BannerMedia";

function MenuItem({ icon, label, onClick, mutedColor }: { icon: React.ReactNode; label: string; onClick?: () => void; mutedColor: string }) {
  return (
    <motion.button
      variants={{
        hidden: { opacity: 0, x: -20 },
        show: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 320, damping: 24 } },
      }}
      whileHover={{ x: 4 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-white/5 text-left transition-colors"
    >
      <span className={mutedColor}>{icon}</span>
      <span>{label}</span>
    </motion.button>
  );
}

/** Menú lateral: perfil y navegación (ajustes y acerca en pantallas propias). */
export function SideMenu({
  open,
  theme: t,
  me,
  friendCode,
  latencyMs,
  isConnected,
  bannerStyleFor,
  onClose,
  onEditProfile,
  onOpenFriends,
  onOpenThemes,
  onOpenFonts,
  onOpenSettings,
  onOpenAbout,
  onCopyFriendCode,
}: {
  open: boolean;
  theme: ThemeTokens;
  me: Participant;
  friendCode: string;
  latencyMs: number | null;
  isConnected: boolean;
  bannerStyleFor: (p: Participant | null | undefined) => React.CSSProperties;
  onClose: () => void;
  onEditProfile: () => void;
  onOpenFriends: () => void;
  onOpenThemes: () => void;
  onOpenFonts: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  onCopyFriendCode: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/30 z-40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className={`absolute top-0 left-0 h-full w-[85%] max-w-xs ${t.bg} border-r ${t.border} z-50 flex flex-col shadow-2xl`}
          >
            <div className={`relative shrink-0 overflow-hidden border-b ${t.border}`}>
              {/* Banner de fondo: cubre todo el encabezado hasta la línea */}
              <div className="absolute inset-0" style={me.banner ? undefined : bannerStyleFor(me)}>
                {me.banner && <BannerMedia src={me.banner} />}
              </div>
              {/* Velo para legibilidad del texto sobre el banner */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
              <div className="absolute top-2.5 right-2.5 z-10">
                <CloseButton onClick={onClose} className="bg-black/40 hover:bg-black/60 text-white shadow-md" size="small" />
              </div>
              {/* Contenido: avatar y datos centrados, sin recortes */}
              <button
                onClick={onEditProfile}
                className="relative w-full flex items-center gap-3 px-4 pt-5 pb-3 text-left"
                aria-label="Editar perfil"
              >
                <div
                  className="size-14 rounded-full flex items-center justify-center text-white text-xl overflow-hidden border-[3px] shadow-xl shrink-0"
                  style={{ backgroundColor: me.color, borderColor: "rgba(255,255,255,0.9)" }}
                >
                  {me.avatar ? <img src={me.avatar} alt="" className="size-full object-cover" /> : me.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate font-display text-sm flex items-center gap-1.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    <span className="truncate">{me.name}</span>
                    <Pencil className="size-3 shrink-0 text-white/80" />
                  </div>
                  <div className={`flex items-center gap-1.5 text-xs mt-0.5 ${STATUSES[me.status].color} drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]`}>
                    <span className={`size-1.5 rounded-full ${STATUSES[me.status].bg}`} />
                    {STATUSES[me.status].label}
                  </div>
                </div>
              </button>
            </div>

            <motion.nav
              className="flex-1 p-3 space-y-1 overflow-y-auto"
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.15 } } }}
            >
              <MenuItem icon={<User className="size-5" />} label="Editar perfil" onClick={onEditProfile} mutedColor={t.textMuted} />
              <MenuItem icon={<UserPlus className="size-5" />} label="Amigos y Forward Token" onClick={onOpenFriends} mutedColor={t.textMuted} />
              <MenuItem icon={<Palette className="size-5" />} label="Temas" onClick={onOpenThemes} mutedColor={t.textMuted} />
              <MenuItem icon={<Type className="size-5" />} label="Fuentes" onClick={onOpenFonts} mutedColor={t.textMuted} />
              <MenuItem icon={<Settings className="size-5" />} label="Ajustes" onClick={onOpenSettings} mutedColor={t.textMuted} />
              <MenuItem icon={<Info className="size-5" />} label="Acerca de Forward_Code" onClick={onOpenAbout} mutedColor={t.textMuted} />
            </motion.nav>

            <div className={`p-3 border-t ${t.border}`}>
              {/* Estado de conexión en tiempo real */}
              <div className={`w-full mb-2 flex items-center gap-2 px-3 py-2 rounded-lg ${t.inputBg} border ${t.border} text-xs`} role="status">
                {isConnected ? (
                  <Wifi className={`size-3.5 ${latencyMs !== null && latencyMs >= 350 ? "text-red-400" : latencyMs !== null && latencyMs >= 120 ? "text-yellow-400" : "text-emerald-400"}`} />
                ) : (
                  <WifiOff className="size-3.5 text-red-400" />
                )}
                <span className="flex-1">Conexión</span>
                <span className={t.textMuted}>
                  {!isConnected ? "Reconectando..." : latencyMs === null ? "Midiendo..." : `${latencyMs} ms`}
                </span>
              </div>
              {friendCode && (
                <button
                  onClick={onCopyFriendCode}
                  className={`w-full mb-2 flex items-center justify-center gap-2 px-3 py-2 rounded-lg ${t.inputBg} border ${t.border} text-xs hover:opacity-80`}
                  title="Copiar mi Forward Token"
                >
                  <KeyRound className={`size-3.5 ${t.accentText}`} />
                  <span className="font-pixel-ui tracking-wider">{friendCode}</span>
                  <Copy className="size-3 opacity-60" />
                </button>
              )}
              <div className={`text-[10px] ${t.textMuted} tracking-widest text-center font-pixel-ui`}>
                FORWARD_CHAT v3.0
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
