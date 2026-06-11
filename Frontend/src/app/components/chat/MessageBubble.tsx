import React, { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Ban, Reply, Smile, Sparkles, Star, Trash2 } from "lucide-react";
import type { ThemeTokens } from "../../lib/themes";
import { getThemeBgColor } from "../../lib/themes";
import {
  Message,
  Participant,
  REACTIONS,
  QUICK_EMOJIS,
  STATUSES,
  Status,
  messagePreview,
} from "../../lib/chat";
import { AudioPlayer } from "./AudioPlayer";

export function StatusDot({ status, theme: t, size = "default" }: { status: Status; theme: ThemeTokens; size?: "default" | "large" }) {
  const dim = size === "large" ? "size-4" : "size-3";
  return (
    <span
      className={`absolute -bottom-[3px] -right-[3px] ${dim} rounded-full ${STATUSES[status].bg}`}
      style={{ boxShadow: `0 0 0 2.5px ${getThemeBgColor(t)}` }}
      aria-label={STATUSES[status].label}
    />
  );
}

export function MessageBubble({
  msg,
  author,
  isMine,
  showAuthor,
  theme: t,
  selfId,
  pickerOpen,
  pickerBelow,
  onTogglePicker,
  onClosePicker,
  onDelete,
  onReact,
  onReply,
  onAvatarClick,
  onSaveSticker,
  formatText,
}: {
  msg: Message;
  author: Participant;
  isMine: boolean;
  showAuthor: boolean;
  theme: ThemeTokens;
  selfId: string;
  pickerOpen: boolean;
  pickerBelow?: boolean;
  onTogglePicker: () => void;
  onClosePicker: () => void;
  onDelete: () => void;
  onReact: (reactionId: string) => void;
  onReply: () => void;
  onAvatarClick: () => void;
  onSaveSticker: (url: string) => void;
  formatText: (text?: string) => React.ReactNode;
}) {
  const longPressTimer = useRef<number | null>(null);
  const longPressedRef = useRef(false);
  const swipeStartXRef = useRef<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const SWIPE_TRIGGER = 56;
  const SWIPE_MAX = 80;

  const startLongPress = () => {
    longPressedRef.current = false;
    longPressTimer.current = window.setTimeout(() => {
      longPressedRef.current = true;
      onTogglePicker();
    }, 400);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (msg.deleted) return;
    swipeStartXRef.current = e.clientX;
    startLongPress();
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!msg.deleted) onReply();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (swipeStartXRef.current === null) return;
    const raw = e.clientX - swipeStartXRef.current;
    if (Math.abs(raw) > 6) cancelLongPress();
    const directional = isMine ? Math.min(0, raw) : Math.max(0, raw);
    const clamped = Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, directional));
    setSwipeOffset(clamped);
  };

  const finishSwipe = () => {
    if (!msg.deleted && Math.abs(swipeOffset) >= SWIPE_TRIGGER) onReply();
    swipeStartXRef.current = null;
    setSwipeOffset(0);
  };

  const handlePointerUp = () => {
    cancelLongPress();
    finishSwipe();
  };

  const handlePointerLeave = () => {
    cancelLongPress();
    swipeStartXRef.current = null;
    setSwipeOffset(0);
  };

  const reactionEntries = Object.entries(msg.reactions || {}).filter(([, users]) => users.length > 0);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className={`flex items-end gap-2 group ${isMine ? "justify-end" : "justify-start"}`}
    >
      {!isMine && (
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.92 }}
          onClick={onAvatarClick}
          className="relative size-8 rounded-full flex items-center justify-center shrink-0 text-white overflow-hidden font-pixel-ui text-sm shadow-md"
          style={{ backgroundColor: author.color }}
          aria-label={`Ver perfil de ${author.name}`}
        >
          {author.avatar ? <img src={author.avatar} alt="" className="size-full object-cover" /> : author.name.charAt(0).toUpperCase()}
          <StatusDot status={author.status} theme={t} />
        </motion.button>
      )}

      {isMine && !msg.deleted && (
        <motion.button
          initial={{ opacity: 0, scale: 0.6, x: 8 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          whileHover={{ scale: 1.15, rotate: -10 }}
          whileTap={{ scale: 0.85, rotate: 15 }}
          transition={{ type: "spring", stiffness: 400, damping: 18 }}
          onClick={onDelete}
          className={`p-2 rounded-full ${t.iconBtn} text-red-400 self-center opacity-0 group-hover:opacity-100 transition-opacity max-md:hidden`}
          aria-label="Eliminar mensaje"
        >
          <Trash2 className="size-4" />
        </motion.button>
      )}

      <div className={`relative flex flex-col ${isMine ? "items-end" : "items-start"}`}>
        {!msg.deleted && (
          <motion.span
            animate={{
              opacity: Math.min(Math.abs(swipeOffset) / SWIPE_TRIGGER, 1),
              scale: 0.8 + Math.min(Math.abs(swipeOffset) / SWIPE_TRIGGER, 1) * 0.35,
            }}
            transition={{ type: "spring", stiffness: 380, damping: 20 }}
            className={`absolute top-1/2 -translate-y-1/2 ${isMine ? "left-0 -translate-x-7" : "right-0 translate-x-7"} ${t.accentText}`}
          >
            <Reply className="size-4" />
          </motion.span>
        )}
        <div className={`flex items-end gap-1.5 ${isMine ? "flex-row" : "flex-row-reverse"}`}>
          {!msg.deleted && (
            <motion.button
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.2, rotate: -8 }}
              whileTap={{ scale: 0.85, rotate: 12 }}
              transition={{ type: "spring", stiffness: 400, damping: 18 }}
              onClick={onTogglePicker}
              className={`p-1.5 rounded-full ${t.iconBtn} self-center opacity-0 group-hover:opacity-100 transition-opacity max-md:hidden`}
              aria-label="Reaccionar"
            >
              <Smile className="size-4" />
            </motion.button>
          )}

          <motion.div
            layout
            animate={{ x: swipeOffset }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onContextMenu={handleContextMenu}
            style={{
              ...(!msg.deleted && !isMine && !msg.isBot && msg.kind !== "sticker" ? { borderLeft: `3px solid ${author.color}` } : {}),
              touchAction: "pan-y",
            }}
            className={msg.kind === "sticker" && !msg.deleted ? "max-w-[82%] relative select-none" : `max-w-[82%] rounded-2xl overflow-hidden select-none ${
              msg.deleted ? `${t.iconBtn} italic` : msg.isBot ? "bg-gradient-to-br from-purple-500/20 to-purple-600/10 backdrop-blur-sm border border-purple-500/50 shadow-[0_0_20px_rgba(139,92,246,0.3),0_0_40px_rgba(139,92,246,0.1)]" : isMine ? t.mineBubble : t.otherBubble
            }`}
          >
            {msg.deleted ? (
              <div className={`flex items-center gap-2 px-4 py-2.5 ${t.textMuted} font-comic`}>
                <Ban className="size-4" />
                <span>Mensaje eliminado</span>
              </div>
            ) : (
              <>
                {msg.replyTo && (
                  <div
                    className={`mx-3 mt-2 rounded-lg px-2.5 py-1.5 border-l-2 ${
                      isMine ? "bg-white/20 border-white/70 text-white/90" : msg.isBot ? "bg-purple-500/15 border-purple-400/70" : `${t.inputBg} border ${t.border} ${t.text}`
                    }`}
                  >
                    <div className={`text-[10px] font-pixel-ui tracking-widest ${isMine ? "text-white/85" : t.accentText}`}>
                      {(msg.replyTo.authorName || "anónimo").toUpperCase()}
                    </div>
                    <div className={`text-xs line-clamp-2 break-words [overflow-wrap:anywhere] ${isMine ? "text-white/90" : t.textMuted}`}>
                      {messagePreview(msg.replyTo.kind, msg.replyTo.text === "sticker_file" ? undefined : msg.replyTo.text)}
                    </div>
                  </div>
                )}
                {showAuthor && msg.kind !== "sticker" && (
                  <div
                    className={`font-pixel-ui text-[10px] tracking-widest px-4 pt-2 flex items-center gap-1`}
                    style={{ color: isMine ? "rgba(255,255,255,0.85)" : msg.isBot ? "#a78bfa" : author.color }}
                  >
                    {msg.isBot && <Sparkles className="size-3" />}
                    {isMine ? "TÚ" : author.name.toUpperCase()}
                  </div>
                )}
                {msg.kind === "text" && (
                  <div className={`px-4 ${showAuthor ? "" : "pt-2"} font-comic ${isMine ? "text-white" : t.text} break-words [word-break:break-word] [overflow-wrap:anywhere] whitespace-pre-wrap`}>{formatText(msg.text)}</div>
                )}
                {msg.kind === "image" && msg.imageUrl && (
                  <div className="px-2 pt-1">
                    <img src={msg.imageUrl} alt="" className="rounded-lg max-w-full max-h-64 object-cover" loading="lazy" />
                    {msg.text && (
                      <div className={`px-2 pt-2 font-comic ${isMine ? "text-white" : t.text} break-words [word-break:break-word] [overflow-wrap:anywhere]`}>{formatText(msg.text)}</div>
                    )}
                  </div>
                )}
                {msg.kind === "sticker" && msg.imageUrl && (
                  <div className="relative group/sticker p-1">
                    <img
                      src={msg.imageUrl}
                      alt="sticker"
                      className="w-32 h-32 md:w-40 md:h-40 object-contain block"
                      loading="lazy"
                    />
                    {!isMine && (
                      <motion.button
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSaveSticker(msg.imageUrl!);
                        }}
                        className="absolute bottom-1 right-1 p-1.5 rounded-full bg-black/50 text-white backdrop-blur-sm shadow-md border border-white/10 opacity-0 group-hover/sticker:opacity-100 transition-opacity"
                        title="Guardar sticker"
                      >
                        <Star className="size-3 text-white" />
                      </motion.button>
                    )}
                  </div>
                )}
                {msg.kind === "audio" && (
                  <AudioPlayer url={msg.audioUrl || ""} duration={msg.audioDuration || 0} theme={t} mine={isMine} />
                )}
                <div className={`font-pixel text-[10px] px-2 pb-1 pt-0.5 text-right ${msg.kind === "sticker" ? `${t.textMuted} drop-shadow-sm` : isMine ? "text-white/70" : t.textMuted}`}>{msg.time}</div>
              </>
            )}
          </motion.div>
        </div>

        {/* Chips de reacciones (sincronizadas, con conteo) */}
        {reactionEntries.length > 0 && (
          <motion.div
            layout
            initial={{ scale: 0, y: -4 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 18 }}
            className="-mt-2 mr-2 flex items-center gap-1 flex-wrap max-w-[82%]"
          >
            {reactionEntries.map(([rid, users]) => {
              const mineToo = users.includes(selfId);
              let content: React.ReactNode = null;
              if (rid.startsWith("e:")) {
                content = <span className="text-sm leading-none">{rid.slice(2)}</span>;
              } else {
                const R = REACTIONS.find((x) => `i:${x.key}` === rid);
                if (!R) return null;
                const Icon = R.icon;
                content = <Icon className={`size-3.5 ${R.color}`} />;
              }
              return (
                <motion.button
                  key={rid}
                  initial={{ scale: 0, rotate: -45 }}
                  animate={{ scale: 1, rotate: 0 }}
                  whileTap={{ scale: 0.85 }}
                  transition={{ type: "spring", stiffness: 500, damping: 18 }}
                  onClick={() => onReact(rid)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full border shadow-md ${t.panel} ${
                    mineToo ? t.borderStrong : t.border
                  }`}
                  title={mineToo ? "Quitar mi reacción" : "Reaccionar igual"}
                >
                  {content}
                  {users.length > 1 && <span className={`text-[10px] tabular-nums ${t.textMuted}`}>{users.length}</span>}
                </motion.button>
              );
            })}
          </motion.div>
        )}

        {/* Selector de reacciones */}
        <AnimatePresence>
          {pickerOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={onClosePicker} />
              <motion.div
                initial={{ opacity: 0, y: pickerBelow ? -10 : 10, scale: 0.85 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: pickerBelow ? -10 : 10, scale: 0.85 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                className={`absolute ${pickerBelow ? "top-full mt-2" : "bottom-full mb-2"} ${isMine ? "right-0" : "left-0"} z-40 max-w-[90vw] ${t.panel} border ${t.borderStrong} rounded-2xl px-2 py-2 shadow-2xl backdrop-blur`}
              >
                <div className="flex items-center gap-1">
                  {REACTIONS.map((r, i) => {
                    const rid = `i:${r.key}`;
                    const Icon = r.icon;
                    const active = (msg.reactions?.[rid] || []).includes(selfId);
                    return (
                      <motion.button
                        key={r.key}
                        initial={{ opacity: 0, y: 8, scale: 0.5 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ delay: i * 0.04, type: "spring", stiffness: 400, damping: 18 }}
                        whileHover={{ scale: 1.3, y: -3 }}
                        whileTap={{ scale: 0.85 }}
                        onClick={() => onReact(rid)}
                        className={`p-1.5 rounded-full ${active ? t.accentSoft : "hover:bg-white/10"}`}
                        aria-label={r.label}
                      >
                        <Icon className={`size-5 ${r.color}`} />
                      </motion.button>
                    );
                  })}
                </div>
                <div className={`flex items-center gap-0.5 mt-1 pt-1 border-t ${t.border}`}>
                  {QUICK_EMOJIS.map((char, i) => {
                    const rid = `e:${char}`;
                    const active = (msg.reactions?.[rid] || []).includes(selfId);
                    return (
                      <motion.button
                        key={char}
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.1 + i * 0.03, type: "spring", stiffness: 400, damping: 18 }}
                        whileHover={{ scale: 1.3, y: -3 }}
                        whileTap={{ scale: 0.85 }}
                        onClick={() => onReact(rid)}
                        className={`p-1 rounded-full text-base leading-none ${active ? t.accentSoft : "hover:bg-white/10"}`}
                        aria-label={`Reaccionar ${char}`}
                      >
                        {char}
                      </motion.button>
                    );
                  })}
                </div>
                {/* Acciones rápidas (en móvil no hay botones de hover) */}
                <div className={`flex items-center gap-1 mt-1 pt-1 border-t ${t.border} md:hidden`}>
                  <button
                    onClick={() => {
                      onReply();
                      onClosePicker();
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg ${t.iconBtn} text-xs`}
                  >
                    <Reply className="size-3.5" /> Responder
                  </button>
                  {isMine && (
                    <button
                      onClick={onDelete}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg ${t.iconBtn} text-red-400 text-xs`}
                    >
                      <Trash2 className="size-3.5" /> Eliminar
                    </button>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {isMine && (
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.92 }}
          onClick={onAvatarClick}
          className="relative size-8 rounded-full flex items-center justify-center shrink-0 text-white overflow-hidden font-pixel-ui text-sm shadow-md"
          style={{ backgroundColor: author.color }}
          aria-label="Ver tu perfil"
        >
          {author.avatar ? <img src={author.avatar} alt="" className="size-full object-cover" /> : author.name.charAt(0).toUpperCase()}
          <StatusDot status={author.status} theme={t} />
        </motion.button>
      )}
    </motion.div>
  );
}
