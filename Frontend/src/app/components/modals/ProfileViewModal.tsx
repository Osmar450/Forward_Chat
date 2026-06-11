import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { AtSign, Bot, KeyRound, MessageSquare, Pencil, Sparkles } from "lucide-react";
import type { ThemeTokens } from "../../lib/themes";
import { Participant, STATUSES } from "../../lib/chat";
import { CloseButton } from "../common/CloseButton";

/** Tarjeta de perfil de cualquier participante (incluido uno mismo). */
export function ProfileViewModal({
  profile: p,
  theme: t,
  selfId,
  friends,
  bannerStyleFor,
  onClose,
  onEditProfile,
  onOpenChat,
}: {
  profile: Participant | null;
  theme: ThemeTokens;
  selfId: string;
  friends: string[];
  bannerStyleFor: (p: Participant | null | undefined) => React.CSSProperties;
  onClose: () => void;
  onEditProfile: () => void;
  onOpenChat: (id: string) => void;
}) {
  return (
    <AnimatePresence>
      {p && (() => {
        const S = STATUSES[p.status];
        const isSelfProfile = p.id === selfId;
        const isFriend = friends.includes(p.id);
        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 20 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-xs ${t.panel} rounded-2xl shadow-2xl overflow-hidden border ${t.border}`}
            >
              {/* Banner del perfil */}
              <div className="relative h-24 overflow-hidden" style={bannerStyleFor(p)}>
                {p.banner && <img src={p.banner} alt="" className="size-full object-cover" />}
              </div>
              <div className="px-5 pb-5 -mt-10">
                <div className="flex items-end justify-between mb-3">
                  <div className="relative">
                    <div
                      className="size-20 rounded-full flex items-center justify-center text-white text-3xl overflow-hidden shadow-xl border-4"
                      style={{ backgroundColor: p.color, borderColor: t.accentHex }}
                    >
                      {p.avatar ? <img src={p.avatar} alt="" className="size-full object-cover" /> : p.isBot ? <Bot className="size-8" /> : p.name.charAt(0).toUpperCase()}
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 size-5 rounded-full ${S.bg} border-2`} style={{ borderColor: t.accentHex }} />
                  </div>
                  <CloseButton onClick={onClose} className={`${t.iconBtn} border shadow-sm`} size="small" />
                </div>
                <div className="font-display text-base flex items-center gap-1.5">
                  {p.name}
                  {p.isBot && <Sparkles className="size-3.5 text-purple-400" />}
                </div>
                <div className={`text-xs font-pixel-ui flex items-center gap-1.5 mt-1 ${S.color}`}>
                  <S.icon className="size-3" fill={p.status === "online" || p.status === "dnd" ? "currentColor" : "none"} />
                  {S.label}
                </div>

                {p.bio && (
                  <>
                    <div className={`mt-3 text-[10px] font-pixel-ui tracking-widest ${t.textMuted}`}>SOBRE MÍ</div>
                    <div className={`text-sm ${t.text} whitespace-pre-wrap break-words`}>{p.bio}</div>
                  </>
                )}

                <div className={`mt-3 text-[10px] font-pixel-ui tracking-widest ${t.textMuted}`}>ID DE USUARIO</div>
                <div className={`text-sm ${t.text} flex items-center gap-1`}><AtSign className="size-3.5 opacity-60" />{p.id}</div>

                {isSelfProfile ? (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      onClose();
                      onEditProfile();
                    }}
                    className={`mt-4 w-full py-2.5 rounded-xl ${t.accent} ${t.accentHover} text-white flex items-center justify-center gap-2 shadow-lg`}
                  >
                    <Pencil className="size-4" />
                    <span className="text-sm">Editar perfil</span>
                  </motion.button>
                ) : isFriend || p.isBot ? (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      onClose();
                      onOpenChat(p.id);
                    }}
                    className={`mt-4 w-full py-2.5 rounded-xl ${t.accent} ${t.accentHover} text-white flex items-center justify-center gap-2 shadow-lg`}
                  >
                    <MessageSquare className="size-4" />
                    <span className="text-sm">Enviar mensaje</span>
                  </motion.button>
                ) : (
                  <div className={`mt-4 rounded-xl ${t.inputBg} border ${t.border} p-3 text-[11px] ${t.textMuted} flex items-start gap-2`}>
                    <KeyRound className={`size-4 shrink-0 ${t.accentText}`} />
                    <span>Para chatear en privado con {p.name}, pídele su <b>Forward Token</b> y agrégalo desde el menú de Amigos.</span>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        );
      })()}
    </AnimatePresence>
  );
}
