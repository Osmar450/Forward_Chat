import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronsDown, KeyRound, Loader2, MessagesSquare } from "lucide-react";
import type { ThemeTokens } from "../../lib/themes";
import {
  GROUP_GAP_MS,
  LOBBY,
  Message,
  Participant,
  Receipt,
  colorForUser,
  fmtDayLabel,
  isSameDay,
} from "../../lib/chat";
import { MessageBubble } from "./MessageBubble";

const PAGE_SIZE = 80;

/** Separador de día centrado ("Hoy", "Ayer", "Lunes"...). */
function DaySeparator({ label, theme: t }: { label: string; theme: ThemeTokens }) {
  return (
    <div className="flex items-center gap-3 py-1" role="separator" aria-label={label}>
      <div className={`flex-1 h-px ${t.isLight ? "bg-black/10" : "bg-white/10"}`} />
      <span className={`text-[10px] font-pixel-ui tracking-widest ${t.textMuted}`}>{label.toUpperCase()}</span>
      <div className={`flex-1 h-px ${t.isLight ? "bg-black/10" : "bg-white/10"}`} />
    </div>
  );
}

/** Divisor de "mensajes nuevos" al entrar a un chat con pendientes. */
function UnreadDivider({ theme: t }: { theme: ThemeTokens }) {
  return (
    <div className="flex items-center gap-3 py-1" role="separator" aria-label="Mensajes nuevos">
      <div className={`flex-1 h-px ${t.accent} opacity-60`} />
      <span className={`text-[10px] font-pixel-ui tracking-widest ${t.accentText}`}>MENSAJES NUEVOS</span>
      <div className={`flex-1 h-px ${t.accent} opacity-60`} />
    </div>
  );
}

/** Esqueleto de carga mientras llega el historial inicial. */
function ChatSkeleton({ theme: t }: { theme: ThemeTokens }) {
  const widths = ["w-40", "w-56", "w-32", "w-48", "w-44"];
  return (
    <div className="space-y-4 pt-2" aria-hidden="true">
      {widths.map((w, i) => {
        const mine = i % 3 === 2;
        return (
          <div key={i} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
            {!mine && <div className={`size-8 rounded-full shrink-0 animate-pulse ${t.isLight ? "bg-black/10" : "bg-white/10"}`} />}
            <div className={`${w} h-10 rounded-2xl animate-pulse ${t.isLight ? "bg-black/10" : "bg-white/10"}`} />
          </div>
        );
      })}
    </div>
  );
}

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
  isConnected,
  unreadCount,
  unreadMarkerId,
  peerReadAt,
  showReceipts,
  searchActive,
  searchQuery,
  currentSearchId,
  serverHasMore,
  onLoadOlder,
  onDelete,
  onReply,
  onEdit,
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
  isConnected: boolean;
  unreadCount: number;
  unreadMarkerId: string | number | null;
  peerReadAt: number;
  showReceipts: boolean;
  searchActive: boolean;
  /** Texto buscado: se resalta dentro de las burbujas */
  searchQuery: string;
  currentSearchId: string | number | null;
  /** El servidor aún tiene historial más antiguo (paginación por cursor) */
  serverHasMore: boolean;
  onLoadOlder: () => void;
  onDelete: (id: string | number) => void;
  onReply: (msg: Message) => void;
  onEdit: (msg: Message) => void;
  onViewProfile: (id: string) => void;
  onSaveSticker: (url: string) => void;
  formatText: (text?: string) => React.ReactNode;
  onScrollToBottom: () => void;
}) {
  // Ventana de render: solo los últimos N mensajes (con "ver anteriores").
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const prevHeightRef = useRef<number | null>(null);

  useEffect(() => setVisibleCount(PAGE_SIZE), [activeChat]);

  // Durante una búsqueda se muestra todo para poder saltar a coincidencias viejas
  const effectiveCount = searchActive ? messages.length : visibleCount;
  const visible = messages.slice(Math.max(0, messages.length - effectiveCount));
  const hiddenCount = messages.length - visible.length;

  // true mientras esperamos una página del servidor (cursor)
  const pendingServerLoadRef = useRef(false);
  const prevLenRef = useRef(messages.length);

  const loadOlder = () => {
    const el = scrollRef.current;
    prevHeightRef.current = el ? el.scrollHeight - el.scrollTop : null;
    if (hiddenCount > 0) {
      setVisibleCount((c) => c + PAGE_SIZE);
    } else if (serverHasMore) {
      pendingServerLoadRef.current = true;
      onLoadOlder();
      // Red de seguridad: si la página por cursor nunca llega, desbloquear
      window.setTimeout(() => {
        pendingServerLoadRef.current = false;
      }, 6000);
    }
  };

  // ==========================================
  // PAGINACIÓN POR CURSOR CON INTERSECTION OBSERVER
  // El sentinel del tope dispara la carga de mensajes anteriores sin que el
  // usuario pulse nada; la restauración de scroll evita el "snap" al tope.
  // ==========================================
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const lastAutoLoadRef = useRef(0);
  const loadOlderRef = useRef(loadOlder);
  loadOlderRef.current = loadOlder;
  const canLoadOlder = hiddenCount > 0 || serverHasMore;
  const canLoadOlderRef = useRef(canLoadOlder);
  canLoadOlderRef.current = canLoadOlder;
  const hasMessages = messages.length > 0;

  useEffect(() => {
    const root = scrollRef.current;
    const target = topSentinelRef.current;
    if (!root || !target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (!canLoadOlderRef.current || pendingServerLoadRef.current) return;
        const now = Date.now();
        if (now - lastAutoLoadRef.current < 400) return;
        lastAutoLoadRef.current = now;
        loadOlderRef.current();
      },
      { root, rootMargin: "150px 0px 0px 0px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat, hasMessages, canLoadOlder]);

  // Al llegar la página del servidor, ampliar la ventana para que se vea
  useLayoutEffect(() => {
    const delta = messages.length - prevLenRef.current;
    prevLenRef.current = messages.length;
    if (pendingServerLoadRef.current && delta > 0) {
      pendingServerLoadRef.current = false;
      setVisibleCount((c) => c + delta);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // Mantener la posición de lectura al cargar mensajes anteriores
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && prevHeightRef.current != null) {
      el.scrollTop = el.scrollHeight - prevHeightRef.current;
      prevHeightRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCount]);

  const receiptFor = (m: Message): Receipt | null => {
    if (!showReceipts || m.authorId !== selfId || m.deleted) return null;
    if (m.pending) return "pending";
    return peerReadAt >= m.timestamp ? "read" : "sent";
  };

  // Al abrir un chat, saltar instantáneamente al último mensaje (doble rAF:
  // espera al layout de burbujas e imágenes antes de medir).
  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: "end" }))
    );
    return () => cancelAnimationFrame(raf);
  }, [activeChat, hasMessages]);

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 space-y-3">
        {messages.length === 0 ? (
          !isConnected ? (
            <ChatSkeleton theme={t} />
          ) : (
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
          )
        ) : (
          <>
            {canLoadOlder && (
              <div ref={topSentinelRef} className="flex justify-center pb-1">
                <button
                  onClick={loadOlder}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-pixel-ui tracking-widest ${t.iconBtn} ${t.textMuted}`}
                  aria-label="Cargar mensajes anteriores"
                >
                  <Loader2 className="size-3.5 animate-spin" />
                  CARGANDO HISTORIAL...
                </button>
              </div>
            )}
            <AnimatePresence initial={false}>
              {visible.map((m, idx) => {
                const author: Participant = participants[m.authorId] || {
                  id: m.authorId,
                  name: m.authorId || "Anónimo",
                  color: colorForUser(m.authorId || "x"),
                  status: "offline",
                };
                const isMine = m.authorId === selfId;
                const prev = visible[idx - 1];
                const newDay = !prev || !isSameDay(prev.timestamp, m.timestamp);
                const showAuthor =
                  !prev || prev.authorId !== m.authorId || newDay || m.timestamp - prev.timestamp > GROUP_GAP_MS;
                if (m.system) {
                  return (
                    <React.Fragment key={m.id}>
                      {newDay && <DaySeparator label={fmtDayLabel(m.timestamp)} theme={t} />}
                      <div className="flex justify-center py-1">
                        <span className={`px-3 py-1 rounded-full text-[11px] ${t.inputBg} border ${t.border} ${t.textMuted}`}>
                          {m.text}
                        </span>
                      </div>
                    </React.Fragment>
                  );
                }
                return (
                  <React.Fragment key={m.id}>
                    {newDay && <DaySeparator label={fmtDayLabel(m.timestamp)} theme={t} />}
                    {unreadMarkerId != null && m.id === unreadMarkerId && !isMine && <UnreadDivider theme={t} />}
                    <MessageBubble
                      msg={m}
                      author={author}
                      isMine={isMine}
                      showAuthor={showAuthor}
                      theme={t}
                      selfId={selfId}
                      receipt={receiptFor(m)}
                      isSearchCurrent={currentSearchId != null && m.id === currentSearchId}
                      highlightQuery={searchActive ? searchQuery : undefined}
                      onDelete={onDelete}
                      onReply={onReply}
                      onEdit={onEdit}
                      onAvatarClick={onViewProfile}
                      onSaveSticker={onSaveSticker}
                      formatText={formatText}
                    />
                  </React.Fragment>
                );
              })}
            </AnimatePresence>
          </>
        )}
        {/* Ancla para el auto-scroll al fondo */}
        <div ref={bottomRef} aria-hidden="true" />
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
            aria-label={unreadCount > 0 ? `Ir al final, ${unreadCount} mensajes nuevos` : "Ir al final"}
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
