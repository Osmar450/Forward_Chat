import React, { useRef, useState } from "react";
import { motion } from "motion/react";
import { Ban, Check, CheckCheck, Clock3, Pencil, Reply, Sparkles, Star, Sticker, Trash2 } from "lucide-react";
import type { ThemeTokens } from "../../lib/themes";
import { getThemeBgColor } from "../../lib/themes";
import {
  Message,
  Participant,
  REACTIONS,
  Receipt,
  STATUSES,
  Status,
  escapeRegExp,
  isGif,
  messagePreview,
} from "../../lib/chat";
import { AudioPlayer } from "./AudioPlayer";
import { ReactionPicker, Reaction, ReactionKey } from "./ReactionPicker";

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

/** Checks de entrega/lectura para mensajes propios en DMs. */
function ReceiptIcon({ receipt, mine, theme: t }: { receipt: Receipt; mine: boolean; theme: ThemeTokens }) {
  if (receipt === "pending") return <Clock3 className={`size-3 ${mine ? "text-white/60" : t.textMuted}`} aria-label="Enviando" />;
  if (receipt === "read") return <CheckCheck className="size-3.5 text-sky-300" aria-label="Leído" />;
  return <Check className={`size-3.5 ${mine ? "text-white/60" : t.textMuted}`} aria-label="Enviado" />;
}

function MessageBubbleInner({
  msg,
  author,
  isMine,
  showAuthor,
  theme: t,
  selfId,
  receipt,
  isSearchCurrent,
  highlightQuery,
  onDelete,
  onReact,
  onReply,
  onEdit,
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
  receipt: Receipt | null;
  isSearchCurrent: boolean;
  /** Texto de búsqueda activo: las coincidencias se resaltan en la burbuja */
  highlightQuery?: string;
  onDelete: (id: string | number) => void;
  onReact: (id: string | number, reactionId: string) => void;
  onReply: (msg: Message) => void;
  onEdit: (msg: Message) => void;
  onAvatarClick: (authorId: string) => void;
  onSaveSticker: (url: string) => void;
  formatText: (text?: string) => React.ReactNode;
}) {
  // Long-press (500ms) abre SOLO el ReactionPicker. El scroll/movimiento cancela.
  const [showPicker, setShowPicker] = useState(false);
  const pressTimer = useRef<number | null>(null);

  const startPress = () => {
    if (msg.deleted) return;
    clearPress();
    pressTimer.current = window.setTimeout(() => {
      setShowPicker(true);
      try { navigator.vibrate?.(40); } catch { /* sin vibración */ }
    }, 500);
  };
  const clearPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  // Una reacción por usuario: el servidor hace toggle/replace; aquí solo se
  // envía el id elegido. currentReactions resalta la activa del usuario.
  const myReactions: Reaction[] = Object.entries(msg.reactions || {})
    .filter(([, users]) => users.includes(selfId))
    .map(([rid]) =>
      rid.startsWith("e:")
        ? { kind: "emoji" as const, char: rid.slice(2) }
        : { kind: "icon" as const, key: rid.slice(2) as ReactionKey }
    );

  const handleSelectReaction = (reaction: Reaction) => {
    const rid = reaction.kind === "icon" ? `i:${reaction.key}` : `e:${reaction.char}`;
    onReact(msg.id, rid);
  };
  // La ventana de 15 min para editar/borrar la valida el servidor; aquí solo
  // se decide qué botones mostrar.
  const canEdit = isMine && !msg.deleted && msg.kind === "text";
  const canDelete = isMine && !msg.deleted;

  const reactionEntries = Object.entries(msg.reactions || {}).filter(([, users]) => users.length > 0);

  /**
   * Cuerpo del mensaje con coincidencias de búsqueda resaltadas.
   * Los segmentos sin coincidencia pasan por formatText (menciones intactas).
   */
  const renderBody = (text?: string): React.ReactNode => {
    const q = highlightQuery?.trim();
    if (!q || !text || !text.toLowerCase().includes(q.toLowerCase())) return formatText(text);
    const regex = new RegExp(`(${escapeRegExp(q)})`, "gi");
    return text.split(regex).map((part, i) =>
      part.toLowerCase() === q.toLowerCase() ? (
        <mark key={i} className="rounded-[3px] px-0.5 bg-yellow-300/80 text-black font-medium">
          {part}
        </mark>
      ) : (
        <React.Fragment key={i}>{formatText(part)}</React.Fragment>
      )
    );
  };

  /** Hora + "editado" + checks de lectura, compartido entre tipos de mensaje. */
  const metaRow = (extraClass = "") => (
    <span className={`inline-flex items-center gap-1 ${extraClass}`}>
      {msg.edited && (
        <span className={`font-pixel italic ${isMine ? "text-white/55" : t.textMuted}`} style={{ fontSize: "10px" }}>
          editado
        </span>
      )}
      <span
        className={`font-pixel whitespace-nowrap opacity-80 ${isMine ? "text-white/70" : t.textMuted}`}
        style={{ fontSize: "11px", lineHeight: "1.4" }}
      >
        {msg.time}
      </span>
      {receipt && <ReceiptIcon receipt={receipt} mine={isMine} theme={t} />}
    </span>
  );

  // Botones de acción inline, SIEMPRE visibles (sin hover ni long-press)
  const actionButtons = !msg.deleted && (
    <span className="flex items-center gap-0.5 self-center shrink-0">
      <motion.button
        whileTap={{ scale: 0.85 }}
        onClick={() => onReply(msg)}
        className={`p-1.5 rounded-full ${t.iconBtn} ${t.accentText}`}
        aria-label="Responder"
        title="Responder"
      >
        <Reply className="size-4" />
      </motion.button>
      {canEdit && (
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={() => onEdit(msg)}
          className={`p-1.5 rounded-full ${t.iconBtn} ${t.textMuted}`}
          aria-label="Editar mensaje"
          title="Editar"
        >
          <Pencil className="size-4" />
        </motion.button>
      )}
      {canDelete && (
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={() => onDelete(msg.id)}
          className={`p-1.5 rounded-full ${t.iconBtn} text-red-400`}
          aria-label="Eliminar mensaje"
          title="Eliminar"
        >
          <Trash2 className="size-4" />
        </motion.button>
      )}
    </span>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      data-msgid={msg.id}
      className={`cv-row flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"}`}
    >
      {!isMine && (
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => onAvatarClick(author.id)}
          className="relative size-8 rounded-full flex items-center justify-center shrink-0 text-white overflow-hidden font-pixel-ui text-sm shadow-md"
          style={{ backgroundColor: author.color }}
          aria-label={`Ver perfil de ${author.name}`}
        >
          {author.avatar ? <img src={author.avatar} alt="" className="size-full object-cover" /> : author.name.charAt(0).toUpperCase()}
          <StatusDot status={author.status} theme={t} />
        </motion.button>
      )}

      <div className={`relative flex flex-col min-w-0 max-w-[88%] md:max-w-[82%] ${isMine ? "items-end" : "items-start"}`}>
        {/* Reaction picker (solo se abre con long-press) */}
        <ReactionPicker
          isOpen={showPicker}
          onClose={() => setShowPicker(false)}
          onSelect={handleSelectReaction}
          position="top"
          currentReactions={myReactions}
        />
        <div className={`flex items-end gap-1.5 ${isMine ? "flex-row" : "flex-row-reverse"}`}>
          {actionButtons}

          <div
            onTouchStart={startPress}
            onTouchEnd={clearPress}
            onTouchMove={clearPress}
            onMouseDown={startPress}
            onMouseUp={clearPress}
            onMouseLeave={clearPress}
            onContextMenu={(e) => e.preventDefault()}
            style={{
              ...(!msg.deleted && !isMine && !msg.isBot && msg.kind !== "sticker"
                ? { borderLeft: `3px solid ${author.color}` }
                : {}),
              touchAction: "pan-y",
            }}
            className={`${msg.kind === "sticker" && !msg.deleted ? `max-w-full relative ${msg.pending ? "opacity-60" : ""}` : `max-w-full min-w-0 rounded-2xl overflow-hidden ${msg.pending ? "opacity-60" : ""} ${
              msg.deleted ? `${t.iconBtn} italic` : msg.isBot ? "bg-gradient-to-br from-purple-500/20 to-purple-600/10 backdrop-blur-sm border border-purple-500/50 shadow-[0_0_20px_rgba(139,92,246,0.3),0_0_40px_rgba(139,92,246,0.1)]" : isMine ? t.mineBubble : t.otherBubble
            }`} ${isSearchCurrent ? `ring-2 ${t.accentRing} ring-offset-1 ring-offset-transparent` : ""}`}
          >
            {msg.deleted ? (
              <div className={`flex items-center gap-2 px-4 py-2.5 ${t.textMuted} font-bubble`}>
                <Ban className="size-4" />
                <span>Mensaje eliminado</span>
              </div>
            ) : (
              <>
                {msg.replyTo && (
                  <div
                    className={`mx-2 mt-2 rounded-md rounded-l-sm pl-2.5 pr-2.5 py-1.5 border-l-[3px] ${
                      isMine
                        ? "bg-black/20 border-white/80 text-white/90"
                        : msg.isBot
                          ? "bg-purple-500/15 border-purple-400"
                          : `${t.isLight ? "bg-black/5" : "bg-white/5"} ${t.text}`
                    }`}
                    style={!isMine && !msg.isBot ? { borderLeftColor: t.accentHex } : undefined}
                  >
                    <div className={`text-[10px] font-pixel-ui tracking-widest ${isMine ? "text-white/85" : t.accentText}`}>
                      {(msg.replyTo.authorName || "anónimo").toUpperCase()}
                    </div>
                    <div className={`text-xs line-clamp-2 break-words ${isMine ? "text-white/80" : t.textMuted}`}>
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
                  <div className={`px-3.5 ${showAuthor ? "pt-0.5" : "pt-2"} pb-1.5 flex flex-wrap items-end gap-x-2`}>
                    <div className={`min-w-0 font-bubble font-light text-[15px] leading-snug ${isMine ? "text-white" : t.text} break-words [word-break:break-word] [overflow-wrap:anywhere] whitespace-pre-wrap`}>
                      {renderBody(msg.text)}
                      {msg.streaming && (
                        <motion.span
                          animate={{ opacity: [1, 0.25, 1] }}
                          transition={{ duration: 1, repeat: Infinity }}
                          className="inline-block w-2 h-4 ml-0.5 align-text-bottom rounded-sm bg-purple-300/80"
                          aria-label="ForwardBot está escribiendo"
                        />
                      )}
                    </div>
                    {!msg.streaming && metaRow("ml-auto")}
                  </div>
                )}
                {msg.kind === "text" && msg.linkPreview && (
                  <a
                    href={msg.linkPreview.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`block mx-2 mb-2 rounded-lg overflow-hidden border transition-opacity hover:opacity-85 ${
                      isMine ? "bg-black/20 border-white/20" : `${t.isLight ? "bg-black/5" : "bg-white/5"} ${t.border}`
                    }`}
                  >
                    {msg.linkPreview.image && (
                      <img
                        src={msg.linkPreview.image}
                        alt=""
                        loading="lazy"
                        className="w-full max-h-36 object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    )}
                    <div className="px-2.5 py-2">
                      {msg.linkPreview.siteName && (
                        <div className={`text-[9px] font-pixel-ui tracking-widest uppercase ${isMine ? "text-white/60" : t.accentText}`}>
                          {msg.linkPreview.siteName}
                        </div>
                      )}
                      <div className={`text-xs font-semibold line-clamp-2 ${isMine ? "text-white" : t.text}`}>
                        {msg.linkPreview.title}
                      </div>
                      {msg.linkPreview.description && (
                        <div className={`text-[11px] line-clamp-2 mt-0.5 ${isMine ? "text-white/70" : t.textMuted}`}>
                          {msg.linkPreview.description}
                        </div>
                      )}
                    </div>
                  </a>
                )}
                {msg.kind === "image" && msg.imageUrl && (
                  <div className="px-2 pt-1">
                    <div className="relative group/media inline-block">
                      <img src={msg.imageUrl} alt={msg.text || "Imagen adjunta"} className="rounded-lg max-w-full max-h-64 object-cover" loading="lazy" />
                      {/* Guardar GIF como sticker (cualquier GIF, propio o ajeno) */}
                      {isGif(msg.imageUrl) && (
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSaveSticker(msg.imageUrl!);
                          }}
                          className="absolute bottom-1.5 right-1.5 p-1.5 rounded-full bg-black/55 text-white backdrop-blur-sm shadow-md border border-white/15 md:opacity-0 md:group-hover/media:opacity-100 transition-opacity"
                          title="Guardar GIF como sticker"
                          aria-label="Guardar GIF como sticker"
                        >
                          <Sticker className="size-3.5 text-white" />
                        </motion.button>
                      )}
                    </div>
                    {msg.text && (
                      <div className={`px-2 pt-2 font-bubble ${isMine ? "text-white" : t.text} break-words [word-break:break-word] [overflow-wrap:anywhere]`}>{renderBody(msg.text)}</div>
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
                        whileTap={{ scale: 0.9 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSaveSticker(msg.imageUrl!);
                        }}
                        className="absolute bottom-1 right-1 p-1.5 rounded-full bg-black/50 text-white backdrop-blur-sm shadow-md border border-white/10 md:opacity-0 md:group-hover/sticker:opacity-100 transition-opacity"
                        title="Guardar sticker"
                        aria-label="Guardar sticker"
                      >
                        <Star className="size-3 text-white" />
                      </motion.button>
                    )}
                  </div>
                )}
                {msg.kind === "audio" && (
                  <AudioPlayer url={msg.audioUrl || ""} duration={msg.audioDuration || 0} theme={t} mine={isMine} />
                )}
                {msg.kind !== "text" && (
                  <div className={`px-2.5 pb-1 pt-0.5 text-right ${msg.kind === "sticker" ? "drop-shadow-sm" : ""}`}>
                    {metaRow()}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Reacciones existentes (solo lectura) */}
        {reactionEntries.length > 0 && (
          <div className="-mt-2 mr-2 flex items-center gap-1 flex-wrap max-w-full">
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
                <span
                  key={rid}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full border shadow-md ${t.panel} ${mineToo ? t.borderStrong : t.border}`}
                >
                  {content}
                  {users.length > 1 && <span className={`text-[10px] tabular-nums ${t.textMuted}`}>{users.length}</span>}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {isMine && (
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => onAvatarClick(author.id)}
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

/** Memo: con cientos de mensajes evita re-renderizar burbujas sin cambios. */
export const MessageBubble = React.memo(MessageBubbleInner);
