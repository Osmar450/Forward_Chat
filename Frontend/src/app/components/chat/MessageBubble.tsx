import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Ban, Check, CheckCheck, Clock3, Copy as CopyIcon, Pencil, Plus, Reply, Smile, Sparkles, Star, Sticker, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
  pickerOpen,
  pickerBelow,
  onTogglePicker,
  onClosePicker,
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
  pickerOpen: boolean;
  pickerBelow?: boolean;
  onTogglePicker: (id: string | number) => void;
  onClosePicker: () => void;
  onDelete: (id: string | number) => void;
  onReact: (id: string | number, reactionId: string) => void;
  onReply: (msg: Message) => void;
  onEdit: (msg: Message) => void;
  onAvatarClick: (authorId: string) => void;
  onSaveSticker: (url: string) => void;
  formatText: (text?: string) => React.ReactNode;
}) {
  const longPressTimer = useRef<number | null>(null);
  const longPressedRef = useRef(false);
  const swipeStartXRef = useRef<number | null>(null);
  const movedRef = useRef(false);
  const interactiveTargetRef = useRef(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [pickerExpanded, setPickerExpanded] = useState(false);
  // Físicas de swipe: umbral bajo y sensible + resistencia progresiva
  const SWIPE_TRIGGER = 44;
  const SWIPE_MAX = 96;
  const SWIPE_SOFT = 64; // a partir de aquí el arrastre ofrece resistencia

  // Acciones siempre visibles para mensajes propios; la ventana de 15 min
  // la impone el servidor (si expiró, el usuario recibe un aviso claro).
  const canEdit = isMine && !msg.deleted && msg.kind === "text";
  const canDelete = isMine && !msg.deleted;

  const startLongPress = () => {
    longPressedRef.current = false;
    longPressTimer.current = window.setTimeout(() => {
      longPressedRef.current = true;
      onTogglePicker(msg.id);
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
    // Los controles internos (links, audio, guardar sticker) manejan su propio tap
    interactiveTargetRef.current = !!(e.target as HTMLElement).closest("button, a, [role='slider']");
    movedRef.current = false;
    swipeStartXRef.current = e.clientX;
    if (!interactiveTargetRef.current) startLongPress();
  };

  // En Android el long-press dispara contextmenu (y a veces cancela los
  // pointer events antes de los 400ms del timer). Lo usamos como segunda vía
  // para abrir el menú de reacciones; el guard evita el doble toggle.
  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!msg.deleted && !longPressedRef.current) {
      longPressedRef.current = true;
      cancelLongPress();
      onTogglePicker(msg.id);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (swipeStartXRef.current === null) return;
    const raw = e.clientX - swipeStartXRef.current;
    if (Math.abs(raw) > 5) {
      cancelLongPress();
      movedRef.current = true;
      if (!swiping) setSwiping(true);
    }
    const directional = isMine ? Math.min(0, raw) : Math.max(0, raw);
    // Resistencia progresiva: 1:1 hasta SWIPE_SOFT, luego se amortigua (sensación nativa)
    const mag = Math.abs(directional);
    const eased = mag <= SWIPE_SOFT ? mag : SWIPE_SOFT + (mag - SWIPE_SOFT) * 0.35;
    setSwipeOffset(Math.sign(directional) * Math.min(SWIPE_MAX, eased));
  };

  const finishSwipe = () => {
    if (!msg.deleted && Math.abs(swipeOffset) >= SWIPE_TRIGGER) onReply(msg);
    swipeStartXRef.current = null;
    setSwiping(false);
    setSwipeOffset(0);
  };

  const handlePointerUp = () => {
    cancelLongPress();
    // Tap simple sobre la burbuja (sin arrastre, sin long-press y fuera de
    // controles internos) también abre el menú de reacciones
    const wasTap = !longPressedRef.current && !movedRef.current && !interactiveTargetRef.current && Math.abs(swipeOffset) < 6;
    finishSwipe();
    if (wasTap && !msg.deleted) onTogglePicker(msg.id);
  };

  const handlePointerLeave = () => {
    cancelLongPress();
    swipeStartXRef.current = null;
    setSwiping(false);
    setSwipeOffset(0);
  };

  const reactionEntries = Object.entries(msg.reactions || {}).filter(([, users]) => users.length > 0);

  // Escudo anti "ghost click": en Android, el click sintético que sigue al
  // tap que ABRIÓ el selector aterriza sobre el overlay/botones recién
  // montados y lo cerraba al instante (parecía que el botón "no funcionaba").
  const pickerOpenedAtRef = useRef(0);
  const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (pickerOpen) pickerOpenedAtRef.current = Date.now();
    else setPickerExpanded(false); // al cerrar, colapsar el panel extendido del "+"
  }, [pickerOpen]);
  const ghostClick = () => Date.now() - pickerOpenedAtRef.current < 300;

  // Cierre por toque fuera del picker SIN un backdrop a pantalla completa: un
  // overlay fixed roba los clicks a los botones del picker (vive en otro
  // contexto de apilamiento por los transforms de las burbujas).
  useEffect(() => {
    if (!pickerOpen) return;
    const onDocPointer = (e: PointerEvent) => {
      if (ghostClick()) return;
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) onClosePicker();
    };
    document.addEventListener("pointerdown", onDocPointer, true);
    return () => document.removeEventListener("pointerdown", onDocPointer, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerOpen]);

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      data-msgid={msg.id}
      className={`cv-row flex items-end gap-2 group ${isMine ? "justify-end" : "justify-start"}`}
    >
      {!isMine && (
        <motion.button
          whileHover={{ scale: 1.1 }}
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

      {isMine && !msg.deleted && (canEdit || canDelete) && (
        <span className="flex items-center gap-0.5 self-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          {canEdit && (
            <motion.button
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.85 }}
              transition={{ type: "spring", stiffness: 400, damping: 18 }}
              onClick={() => onEdit(msg)}
              className={`p-2 rounded-full ${t.iconBtn} ${t.textMuted}`}
              aria-label="Editar mensaje"
            >
              <Pencil className="size-4" />
            </motion.button>
          )}
          {canDelete && (
            <motion.button
              whileHover={{ scale: 1.15, rotate: -10 }}
              whileTap={{ scale: 0.85, rotate: 15 }}
              transition={{ type: "spring", stiffness: 400, damping: 18 }}
              onClick={() => onDelete(msg.id)}
              className={`p-2 rounded-full ${t.iconBtn} text-red-400`}
              aria-label="Eliminar mensaje"
            >
              <Trash2 className="size-4" />
            </motion.button>
          )}
        </span>
      )}

      <div className={`relative flex flex-col min-w-0 max-w-[88%] md:max-w-[82%] ${isMine ? "items-end" : "items-start"}`}>
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
            <span className="flex items-center gap-0.5 self-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
              <motion.button
                whileHover={{ scale: 1.2, rotate: -8 }}
                whileTap={{ scale: 0.85, rotate: 12 }}
                transition={{ type: "spring", stiffness: 400, damping: 18 }}
                onClick={() => onTogglePicker(msg.id)}
                className={`p-1.5 rounded-full ${t.iconBtn}`}
                aria-label="Reaccionar"
              >
                <Smile className="size-4" />
              </motion.button>
              {/* Botón dedicado de Responder (restaurado) */}
              <motion.button
                whileHover={{ scale: 1.2, rotate: 8 }}
                whileTap={{ scale: 0.85 }}
                transition={{ type: "spring", stiffness: 400, damping: 18 }}
                onClick={() => onReply(msg)}
                className={`p-1.5 rounded-full ${t.iconBtn} ${t.accentText}`}
                aria-label="Responder"
              >
                <Reply className="size-4" />
              </motion.button>
            </span>
          )}

          <motion.div
            animate={{ x: swipeOffset }}
            transition={swiping ? { type: "spring", stiffness: 900, damping: 50, mass: 0.4 } : { type: "spring", stiffness: 550, damping: 32 }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerLeave}
            onPointerLeave={handlePointerLeave}
            onContextMenu={handleContextMenu}
            style={{
              ...(!msg.deleted && !isMine && !msg.isBot && msg.kind !== "sticker" ? { borderLeft: `3px solid ${author.color}` } : {}),
              touchAction: "pan-y",
              WebkitTouchCallout: "none",
              WebkitUserSelect: "none",
              userSelect: "none",
            }}
            className={`${msg.kind === "sticker" && !msg.deleted ? `max-w-full relative select-none ${msg.pending ? "opacity-60" : ""}` : `max-w-full min-w-0 rounded-2xl overflow-hidden select-none ${msg.pending ? "opacity-60" : ""} ${
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
                  /* Cita elegante: borde izquierdo marcado + fondo semitransparente,
                     claramente diferenciada del mensaje nuevo sin romper el padding */
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
                  /* Texto + hora estilo WhatsApp: en mensajes cortos comparten
                     línea; en largos la hora baja sola alineada a la derecha. */
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
                  /* Rich link preview (OpenGraph) servido por el backend */
                  <a
                    href={msg.linkPreview.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onPointerDown={(e) => e.stopPropagation()}
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
                          whileHover={{ scale: 1.1 }}
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
                {msg.kind !== "text" && (
                  <div className={`px-2.5 pb-1 pt-0.5 text-right ${msg.kind === "sticker" ? "drop-shadow-sm" : ""}`}>
                    {metaRow()}
                  </div>
                )}
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
            className="-mt-2 mr-2 flex items-center gap-1 flex-wrap max-w-full"
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
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onReact(msg.id, rid); }}
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
              <motion.div
                ref={pickerRef}
                initial={{ opacity: 0, y: pickerBelow ? -10 : 10, scale: 0.85 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: pickerBelow ? -10 : 10, scale: 0.85 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                style={{ backgroundColor: getThemeBgColor(t) }}
                onPointerDown={(e) => e.stopPropagation()}
                className={`absolute ${pickerBelow ? "top-full mt-2" : "bottom-full mb-2"} ${isMine ? "right-0" : "left-0"} z-50 pointer-events-auto max-w-[92vw] border-2 ${t.borderStrong} ${pickerExpanded ? "rounded-2xl" : "rounded-full"} shadow-2xl`}
              >
                {/* Barra horizontal tipo píldora: 6 iconos + botón "+" */}
                <div className="flex items-center gap-0.5 px-1.5 py-1">
                  {REACTIONS.slice(0, 6).map((r, i) => {
                    const rid = `i:${r.key}`;
                    const Icon = r.icon;
                    const active = (msg.reactions?.[rid] || []).includes(selfId);
                    return (
                      <motion.button
                        key={r.key}
                        initial={{ opacity: 0, y: 8, scale: 0.5 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ delay: i * 0.03, type: "spring", stiffness: 400, damping: 18 }}
                        whileHover={{ scale: 1.25, y: -2 }}
                        whileTap={{ scale: 0.85 }}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!ghostClick()) { onReact(msg.id, rid); onClosePicker(); } }}
                        className={`size-9 max-md:size-10 flex items-center justify-center rounded-full ${active ? t.accentSoft : "hover:bg-white/10"}`}
                        aria-label={r.label}
                      >
                        <Icon className={`size-5 ${r.color}`} />
                      </motion.button>
                    );
                  })}
                  <motion.button
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.85 }}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!ghostClick()) setPickerExpanded((v) => !v); }}
                    className={`size-9 max-md:size-10 flex items-center justify-center rounded-full ${pickerExpanded ? t.accentSoft : t.iconBtn}`}
                    aria-label="Más reacciones y acciones"
                    aria-expanded={pickerExpanded}
                  >
                    <Plus className={`size-5 transition-transform ${pickerExpanded ? "rotate-45" : ""}`} />
                  </motion.button>
                </div>

                {/* Panel extendido del "+": reacciones extra + acciones */}
                <AnimatePresence>
                  {pickerExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className={`mx-1.5 mt-0.5 pt-1.5 border-t ${t.border}`}>
                        {REACTIONS.length > 6 && (
                          <div className="flex items-center justify-center gap-0.5 pb-1">
                            {REACTIONS.slice(6).map((r) => {
                              const rid = `i:${r.key}`;
                              const Icon = r.icon;
                              const active = (msg.reactions?.[rid] || []).includes(selfId);
                              return (
                                <motion.button
                                  key={r.key}
                                  whileTap={{ scale: 0.85 }}
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onReact(msg.id, rid); onClosePicker(); }}
                                  className={`size-9 max-md:size-10 flex items-center justify-center rounded-full ${active ? t.accentSoft : "hover:bg-white/10"}`}
                                  aria-label={r.label}
                                >
                                  <Icon className={`size-5 ${r.color}`} />
                                </motion.button>
                              );
                            })}
                          </div>
                        )}
                        <div className="flex items-center gap-1 pb-1.5">
                          <button onClick={() => { onReply(msg); onClosePicker(); }} className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg ${t.iconBtn} text-xs`}>
                            <Reply className="size-3.5" /> Responder
                          </button>
                          {!!msg.text && (
                            <button
                              onClick={() => {
                                navigator.clipboard?.writeText(msg.text || "")
                                  .then(() => toast.success("Mensaje copiado"))
                                  .catch(() => toast.error("No se pudo copiar"));
                                onClosePicker();
                              }}
                              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg ${t.iconBtn} text-xs`}
                            >
                              <CopyIcon className="size-3.5" /> Copiar
                            </button>
                          )}
                          {canEdit && (
                            <button onClick={() => onEdit(msg)} className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg ${t.iconBtn} text-xs`}>
                              <Pencil className="size-3.5" /> Editar
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => onDelete(msg.id)} className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg ${t.iconBtn} text-red-400 text-xs`}>
                              <Trash2 className="size-3.5" /> Eliminar
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {isMine && (
        <motion.button
          whileHover={{ scale: 1.1 }}
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
