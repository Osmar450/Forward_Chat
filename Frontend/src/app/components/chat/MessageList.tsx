import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronsDown, KeyRound, MessagesSquare } from "lucide-react";
import type { ThemeTokens } from "../../lib/themes";
import { LOBBY, Message, Participant, colorForUser } from "../../lib/chat";
import { MessageBubble } from "./MessageBubble";

/** Lista de mensajes del chat activo + botón "ir abajo" con contador. */
export function MessageList({
  theme: t,
  activeChat,
  activePeer,
  messages,
  participants,
  selfId,
  scrollRef,
  isAtBottom,
  unreadCount,
  openMenuFor,
  onTogglePicker,
  onClosePicker,
  onDelete,
  onReact,
  onReply,
  onViewProfile,
  onSaveSticker,
  formatText,
  onScrollToBottom,
}: {
  theme: ThemeTokens;
  activeChat: string;
  activePeer: Participant | null;
  messages: Message[];
  participants: Record<string, Participant>;
  selfId: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  isAtBottom: boolean;
  unreadCount: number;
  openMenuFor: string | number | null;
  onTogglePicker: (id: string | number) => void;
  onClosePicker: () => void;
  onDelete: (id: string | number) => void;
  onReact: (id: string | number, reactionId: string) => void;
  onReply: (msg: Message) => void;
  onViewProfile: (id: string) => void;
  onSaveSticker: (url: string) => void;
  formatText: (text?: string) => React.ReactNode;
  onScrollToBottom: () => void;
}) {
  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
        {messages.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 0.7, y: 0 }} className="h-full flex flex-col items-center justify-center text-center px-6">
            <div className={`size-16 rounded-2xl ${t.iconBtn} flex items-center justify-center mb-4`}>
              {activeChat === LOBBY ? <MessagesSquare className={`size-8 ${t.accentText}`} /> : <KeyRound className={`size-8 ${t.accentText}`} />}
            </div>
            <div className="mb-1">{activeChat === LOBBY ? "No hay mensajes aún" : "Conversación privada"}</div>
            <div className={`text-sm ${t.textMuted}`}>
              {activeChat === LOBBY
                ? "¡Envía el primer mensaje, una foto o un audio!"
                : activePeer?.isBot
                  ? "Pregúntame lo que quieras, papu. También genero imágenes: \"dibuja un gato astronauta\""
                  : "Solo tú y esta persona pueden ver estos mensajes."}
            </div>
          </motion.div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((m, idx) => {
              const author: Participant = participants[m.authorId] || {
                id: m.authorId,
                name: m.authorId || "Anónimo",
                color: colorForUser(m.authorId || "x"),
                status: "offline",
              };
              const isMine = m.authorId === selfId;
              const prev = messages[idx - 1];
              const showAuthor = !prev || prev.authorId !== m.authorId;
              return (
                <MessageBubble
                  key={m.id}
                  msg={m}
                  author={author}
                  isMine={isMine}
                  showAuthor={showAuthor}
                  theme={t}
                  selfId={selfId}
                  pickerBelow={idx < 2}
                  pickerOpen={openMenuFor === m.id}
                  onTogglePicker={() => onTogglePicker(m.id)}
                  onClosePicker={onClosePicker}
                  onDelete={() => onDelete(m.id)}
                  onReact={(rid) => onReact(m.id, rid)}
                  onReply={() => onReply(m)}
                  onAvatarClick={() => onViewProfile(author.id)}
                  onSaveSticker={onSaveSticker}
                  formatText={formatText}
                />
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Botón ir abajo */}
      <AnimatePresence>
        {!isAtBottom && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={onScrollToBottom}
            className={`absolute bottom-24 right-6 size-12 rounded-full ${t.accent} text-white shadow-2xl flex items-center justify-center z-30`}
          >
            <ChevronsDown className="size-6" />
            {unreadCount > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -left-1 size-5 rounded-full bg-green-500 text-[10px] flex items-center justify-center font-bold text-white border-2 border-white"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </motion.div>
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
