import React from "react";
import { motion } from "motion/react";
import { Bot, Hash, KeyRound, Sparkles, UserPlus } from "lucide-react";
import type { ThemeTokens } from "../../lib/themes";
import { BOT_ID, LOBBY, Message, Participant, colorForUser, fmtSmartTime, messagePreview } from "../../lib/chat";
import { StatusDot } from "../chat/MessageBubble";

function ChatListItem({
  theme: t,
  icon,
  title,
  subtitle,
  subtitleAccent = false,
  meta,
  unread,
  onClick,
}: {
  theme: ThemeTokens;
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle: string;
  /** true cuando el subtítulo es presencia en vivo ("escribiendo...") */
  subtitleAccent?: boolean;
  meta?: React.ReactNode;
  unread: number;
  onClick: () => void;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      whileHover={{ x: 3 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors`}
    >
      {icon}
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{title}</div>
        <div className={`text-xs truncate ${subtitleAccent ? `${t.accentText} italic` : t.textMuted}`}>{subtitle}</div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        {meta}
        {unread > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className={`min-w-5 h-5 px-1.5 rounded-full ${t.accent} text-white text-[10px] flex items-center justify-center font-bold`}
          >
            {unread > 99 ? "99+" : unread}
          </motion.span>
        )}
      </div>
    </motion.button>
  );
}

/** Pantalla de inicio: canal público y lista de mensajes privados. */
export function HomeScreen({
  theme: t,
  selfId,
  participants,
  dmList,
  lastOf,
  unread,
  typingUsers,
  onlineCount,
  onOpenChat,
  onAddFriend,
}: {
  theme: ThemeTokens;
  selfId: string;
  participants: Record<string, Participant>;
  dmList: string[];
  lastOf: (key: string) => Message | null;
  unread: Record<string, number>;
  typingUsers: Record<string, Record<string, string>>;
  onlineCount: number;
  onOpenChat: (id: string) => void;
  onAddFriend: () => void;
}) {
  // Presencia granular: nombres escribiendo en cada conversación
  const typingLabelFor = (chatKey: string): string | null => {
    const names = Object.entries(typingUsers[chatKey] || {})
      .filter(([uid]) => uid !== selfId)
      .map(([, n]) => n);
    if (names.length === 0) return null;
    return chatKey === LOBBY ? `${names.join(", ")} escribiendo...` : "escribiendo...";
  };
  return (
    <div className="flex-1 overflow-y-auto">
      <div className={`px-4 pt-4 pb-2 text-[10px] font-pixel-ui tracking-widest ${t.textMuted}`}>CANALES</div>
      <ChatListItem
        theme={t}
        icon={
          <div className={`size-12 rounded-xl ${t.accent} flex items-center justify-center text-white shadow-lg`}>
            <Hash className="size-6" />
          </div>
        }
        title="Lobby Público"
        subtitle={
          typingLabelFor(LOBBY)
            || (lastOf(LOBBY)
              ? `${lastOf(LOBBY)!.authorId === selfId ? "Tú" : participants[lastOf(LOBBY)!.authorId]?.name || "Anónimo"}: ${messagePreview(lastOf(LOBBY)!.kind, lastOf(LOBBY)!.text)}`
              : "Habla con todos los conectados")
        }
        subtitleAccent={!!typingLabelFor(LOBBY)}
        meta={<span className={`text-xs ${t.onlineText}`}>● {onlineCount}</span>}
        unread={unread[LOBBY] || 0}
        onClick={() => onOpenChat(LOBBY)}
      />

      <div className={`px-4 pt-5 pb-2 flex items-center justify-between`}>
        <span className={`text-[10px] font-pixel-ui tracking-widest ${t.textMuted}`}>MENSAJES PRIVADOS</span>
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={onAddFriend}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${t.accentSoft} ${t.accentText} text-xs`}
        >
          <UserPlus className="size-3.5" />
          Agregar
        </motion.button>
      </div>

      {dmList.map((peerId) => {
        const p = participants[peerId];
        const last = lastOf(peerId);
        const isBotChat = peerId === BOT_ID;
        return (
          <ChatListItem
            key={peerId}
            theme={t}
            icon={
              <div
                className="relative size-12 rounded-full flex items-center justify-center text-white text-lg overflow-hidden shadow-md shrink-0"
                style={{ backgroundColor: p?.color || colorForUser(peerId) }}
              >
                {p?.avatar ? <img src={p.avatar} alt="" className="size-full object-cover" /> : isBotChat ? <Bot className="size-6" /> : (p?.name || peerId).charAt(0).toUpperCase()}
                {p && <StatusDot status={p.status} theme={t} />}
              </div>
            }
            title={
              <span className="flex items-center gap-1.5">
                {p?.name || peerId}
                {isBotChat && <Sparkles className="size-3 text-purple-400" />}
              </span>
            }
            subtitle={
              typingLabelFor(peerId)
                || (last
                  ? `${last.authorId === selfId ? "Tú: " : ""}${messagePreview(last.kind, last.text)}`
                  : isBotChat
                    ? "Tu asistente personal de IA"
                    : p?.bio || "Inicia la conversación")
            }
            subtitleAccent={!!typingLabelFor(peerId)}
            meta={last ? <span className={`text-[10px] ${t.textMuted}`}>{fmtSmartTime(last.timestamp)}</span> : null}
            unread={unread[peerId] || 0}
            onClick={() => onOpenChat(peerId)}
          />
        );
      })}

      {dmList.length <= 1 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.8 }} className="px-6 py-8 text-center">
          <KeyRound className={`size-8 mx-auto mb-3 ${t.accentText}`} />
          <div className="text-sm mb-1">Chats privados con Forward Token</div>
          <div className={`text-xs ${t.textMuted} mb-4`}>
            Comparte tu token único con un amigo o ingresa el suyo para hablar en privado.
          </div>
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.95 }}
            onClick={onAddFriend}
            className={`px-4 py-2.5 rounded-xl ${t.accent} ${t.accentHover} text-white text-sm shadow-lg inline-flex items-center gap-2`}
          >
            <UserPlus className="size-4" />
            Agregar amigo
          </motion.button>
        </motion.div>
      )}
      <div className="h-4" />
    </div>
  );
}
