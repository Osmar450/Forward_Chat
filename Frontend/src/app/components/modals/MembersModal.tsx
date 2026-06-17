import { AnimatePresence, motion } from "motion/react";
import { Bot, Sparkles, Users } from "lucide-react";
import type { ThemeTokens } from "../../lib/themes";
import { Participant, STATUSES } from "../../lib/chat";
import { StatusDot } from "../chat/MessageBubble";
import { CloseButton } from "../common/CloseButton";

/** Lista de miembros conectados al lobby. */
export function MembersModal({
  open,
  theme: t,
  onlineIds,
  participants,
  selfId,
  onClose,
  onViewProfile,
}: {
  open: boolean;
  theme: ThemeTokens;
  onlineIds: string[];
  participants: Record<string, Participant>;
  selfId: string;
  onClose: () => void;
  onViewProfile: (id: string) => void;
}) {
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
            className={`w-full max-w-xs ${t.panel} border ${t.borderStrong} rounded-2xl p-5 shadow-2xl max-h-[75dvh] overflow-y-auto`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className={`size-5 ${t.accentText}`} />
                <span>En línea — {onlineIds.length}</span>
              </div>
              <CloseButton onClick={onClose} className={`${t.iconBtn} border shadow-sm`} size="small" />
            </div>
            <div className="space-y-1">
              {onlineIds.map((id) => {
                const p = participants[id];
                if (!p) return null;
                return (
                  <motion.button
                    key={id}
                    whileHover={{ x: 3 }}
                    onClick={() => {
                      onClose();
                      onViewProfile(id);
                    }}
                    className={`w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 text-left`}
                  >
                    <div
                      className="relative size-9 rounded-full flex items-center justify-center text-white text-sm overflow-hidden shrink-0"
                      style={{ backgroundColor: p.color }}
                    >
                      {p.avatar ? <img src={p.avatar} alt="" className="size-full object-cover" /> : p.isBot ? <Bot className="size-4" /> : p.name.charAt(0).toUpperCase()}
                      <StatusDot status={p.status} theme={t} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate flex items-center gap-1.5">
                        {p.name}
                        {p.id === selfId && <span className={`text-[10px] ${t.accentText}`}>(tú)</span>}
                        {p.isBot && <Sparkles className="size-3 text-purple-400" />}
                      </div>
                      <div className={`text-[10px] truncate ${t.textMuted}`}>{p.bio || STATUSES[p.status].label}</div>
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
