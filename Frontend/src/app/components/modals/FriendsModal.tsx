import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Copy, KeyRound, MessageSquare, UserMinus, UserPlus } from "lucide-react";
import type { ThemeTokens } from "../../lib/themes";
import { Participant, STATUSES } from "../../lib/chat";
import { StatusDot } from "../chat/MessageBubble";
import { CloseButton } from "../common/CloseButton";

/** Amigos: Forward Token propio, agregar por código y lista con acciones. */
export function FriendsModal({
  open,
  theme: t,
  friendCode,
  friends,
  participants,
  onCopyCode,
  onAddFriend,
  onClose,
  onViewProfile,
  onOpenChat,
  onRemoveFriend,
}: {
  open: boolean;
  theme: ThemeTokens;
  friendCode: string;
  friends: string[];
  participants: Record<string, Participant>;
  onCopyCode: () => void;
  onAddFriend: (code: string) => void;
  onClose: () => void;
  onViewProfile: (id: string) => void;
  onOpenChat: (id: string) => void;
  onRemoveFriend: (id: string) => void;
}) {
  const [codeInput, setCodeInput] = useState("");

  const submit = () => {
    const code = codeInput.trim();
    if (!code) return;
    onAddFriend(code);
    setCodeInput("");
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-sm ${t.panel} border ${t.borderStrong} rounded-2xl p-5 shadow-2xl max-h-[85dvh] overflow-y-auto`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <UserPlus className={`size-5 ${t.accentText}`} />
                <span>Amigos</span>
              </div>
              <CloseButton onClick={onClose} className={`${t.iconBtn} border shadow-sm`} size="small" />
            </div>

            {/* Mi token */}
            <div className={`text-[10px] font-pixel-ui tracking-widest ${t.textMuted} mb-1.5`}>TU FORWARD TOKEN</div>
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={onCopyCode}
              className={`w-full mb-1 flex items-center justify-between gap-2 px-4 py-3 rounded-xl border-2 pixel-chip ${t.borderStrong} ${t.inputBg}`}
            >
              <span className="flex items-center gap-2">
                <KeyRound className={`size-4 ${t.accentText}`} />
                <span className="font-pixel-ui tracking-widest text-sm">{friendCode || "..."}</span>
              </span>
              <Copy className={`size-4 ${t.textMuted}`} />
            </motion.button>
            <div className={`text-[11px] ${t.textMuted} mb-4`}>
              Es como tu número privado: compártelo solo con quien quieras chatear. Toca para copiar.
            </div>

            {/* Agregar por token */}
            <div className={`text-[10px] font-pixel-ui tracking-widest ${t.textMuted} mb-1.5`}>AGREGAR AMIGO</div>
            <div className="flex gap-2 mb-5">
              <input
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="FWD-XXXX-XXXX"
                className={`flex-1 ${t.inputBg} border ${t.border} rounded-xl px-4 py-2.5 outline-none placeholder:opacity-40 min-w-0 ${t.text} font-pixel-ui tracking-widest text-sm uppercase`}
              />
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
                onClick={submit}
                disabled={!codeInput.trim()}
                className={`px-4 rounded-xl ${codeInput.trim() ? `${t.accent} ${t.accentHover} text-white` : `${t.iconBtn} opacity-50`} shadow-lg`}
              >
                <UserPlus className="size-4" />
              </motion.button>
            </div>

            {/* Lista de amigos */}
            <div className={`text-[10px] font-pixel-ui tracking-widest ${t.textMuted} mb-1.5`}>
              TUS AMIGOS ({friends.length})
            </div>
            {friends.length === 0 ? (
              <div className={`text-xs ${t.textMuted} text-center py-6`}>
                Aún no tienes amigos agregados.<br />¡Intercambia tokens para empezar!
              </div>
            ) : (
              <div className="space-y-1">
                {friends.map((fid) => {
                  const p = participants[fid];
                  if (!p) return null;
                  return (
                    <div key={fid} className={`flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5`}>
                      <button
                        onClick={() => {
                          onClose();
                          onViewProfile(fid);
                        }}
                        className="relative size-9 rounded-full flex items-center justify-center text-white text-sm overflow-hidden shrink-0"
                        style={{ backgroundColor: p.color }}
                      >
                        {p.avatar ? <img src={p.avatar} alt="" className="size-full object-cover" /> : p.name.charAt(0).toUpperCase()}
                        <StatusDot status={p.status} theme={t} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{p.name}</div>
                        <div className={`text-[10px] ${STATUSES[p.status].color}`}>{STATUSES[p.status].label}</div>
                      </div>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => {
                          onClose();
                          onOpenChat(fid);
                        }}
                        className={`p-2 rounded-lg ${t.accentSoft} ${t.accentText}`}
                        title="Enviar mensaje"
                      >
                        <MessageSquare className="size-4" />
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => onRemoveFriend(fid)}
                        className={`p-2 rounded-lg ${t.iconBtn} text-red-400`}
                        title="Eliminar amigo"
                      >
                        <UserMinus className="size-4" />
                      </motion.button>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
