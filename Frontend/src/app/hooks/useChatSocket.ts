import React, { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import {
  BOT_ID,
  LOBBY,
  Message,
  Participant,
  Status,
  USER_COLORS,
  colorForUser,
  dmScopeOf,
  fmtClock,
  parseServerMessage,
} from "../lib/chat";
import {
  BotStreamPayload,
  DmHistoryPayload,
  DmReadPayload,
  ErrorToastPayload,
  FriendAddedPayload,
  HistoryMetaPayload,
  LinkPreviewPayload,
  MessageDeletedPayload,
  MessageEditedPayload,
  OlderMessagesPayload,
  ProfilePayload,
  RateLimitedPayload,
  ReactionUpdatedPayload,
  SearchResultsPayload,
  ServerMessagePayload,
  SessionProfilePayload,
  SmartRepliesPayload,
  TypingPayload,
  chatKeyFromScope,
} from "../lib/socketEvents";

/**
 * Capa de tiempo real de ForwardChat: TODA la lógica de Socket.IO vive aquí
 * (conexión, listeners tipados, presencia, historial paginado, typing,
 * confirmaciones de lectura y latencia). Los componentes solo renderizan.
 */

export interface ChatSocketApi {
  socket: Socket | null;
  isConnected: boolean;
  latencyMs: number | null;
  selfId: string;
  friendCode: string;
  participants: Record<string, Participant>;
  friends: string[];
  onlineIds: string[];
  chats: Record<string, Message[]>;
  unread: Record<string, number>;
  /** Mensajes nuevos por debajo del scroll en el chat activo */
  unreadCount: number;
  typingUsers: Record<string, Record<string, string>>;
  peerReads: Record<string, number>;
  historyMore: Record<string, boolean>;
  /** Sugerencias de respuesta rápida (IA) por chat; se limpian al responder */
  smartReplies: Record<string, string[]>;
  /** Epoch ms hasta el que el envío está en cooldown (anti-flood); 0 = libre */
  cooldownUntil: number;
  /** Consume un slot de envío; false si el anti-flood local lo bloquea */
  consumeSendSlot: () => boolean;
  // ---- acciones ----
  setChats: React.Dispatch<React.SetStateAction<Record<string, Message[]>>>;
  setUnread: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  resetUnreadCount: () => void;
  updateMe: (patch: Partial<Participant>) => void;
  scopeForChat: (chatKey: string) => string;
  resolveMediaUrl: (url?: string | null) => string | undefined;
  /** true si se pudo emitir (hay conexión) */
  emitMessage: (payload: Record<string, unknown>) => boolean;
  emitTyping: () => void;
  clearTypingState: () => void;
  requestDmHistory: (peer: string) => void;
  requestOlderMessages: () => void;
  /** Búsqueda exacta en el servidor; los resultados se fusionan en el chat */
  searchMessages: (query: string) => void;
  editMessage: (msgId: string | number, text: string) => void;
  deleteMessage: (msgId: string | number) => void;
  toggleReaction: (msgId: string | number, reactionId: string) => void;
  addFriend: (code: string) => void;
  removeFriend: (userId: string) => void;
}

export function useChatSocket(options: {
  backendUrl: string;
  activeChat: string | null;
  isAtBottom: boolean;
  /** Se invoca cuando llega el eco de un mensaje propio (limpia la respuesta activa) */
  onOwnEcho?: () => void;
}): ChatSocketApi {
  const { backendUrl, activeChat, isAtBottom } = options;

  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [selfId, setSelfId] = useState("");
  const [friendCode, setFriendCode] = useState("");
  const [participants, setParticipants] = useState<Record<string, Participant>>({});
  const [friends, setFriends] = useState<string[]>([]);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [chats, setChats] = useState<Record<string, Message[]>>({ [LOBBY]: [] });
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [unreadCount, setUnreadCount] = useState(0);
  const [typingUsers, setTypingUsers] = useState<Record<string, Record<string, string>>>({});
  const [peerReads, setPeerReads] = useState<Record<string, number>>({});
  const [historyMore, setHistoryMore] = useState<Record<string, boolean>>({});
  const [smartReplies, setSmartReplies] = useState<Record<string, string[]>>({});
  const [cooldownUntil, setCooldownUntil] = useState(0);

  // Refs: los handlers del socket nunca deben capturar estado obsoleto
  const socketRef = useRef<Socket | null>(null);
  const isConnectedRef = useRef(false);
  const selfIdRef = useRef("");
  const participantsRef = useRef(participants);
  const chatsRef = useRef(chats);
  const activeChatRef = useRef<string | null>(null);
  const isAtBottomRef = useRef(true);
  const everConnectedRef = useRef(false);
  const lastReadSentRef = useRef<Record<string, number>>({});
  // Anti-flood local: espejo (un poco más estricto) del límite del servidor
  const sendTimesRef = useRef<number[]>([]);
  const cooldownUntilRef = useRef(0);
  const typingTimerRef = useRef<number | null>(null);
  const typingSentRef = useRef(false);
  const onOwnEchoRef = useRef(options.onOwnEcho);

  participantsRef.current = participants;
  chatsRef.current = chats;
  activeChatRef.current = activeChat;
  isAtBottomRef.current = isAtBottom;
  selfIdRef.current = selfId;
  onOwnEchoRef.current = options.onOwnEcho;

  // ==========================================
  // HELPERS
  // ==========================================
  const upsertParticipant = useCallback((data: ProfilePayload & { id?: string }, opts: { allowSelf?: boolean } = {}) => {
    const id = data.userId || data.id;
    if (!id) return;
    // El perfil PROPIO solo lo controlan el "session profile" inicial y mis
    // ediciones locales; un eco viejo nunca debe revertir el nombre.
    if (id === selfIdRef.current && !opts.allowSelf) return;
    setParticipants((prev) => {
      const existing = prev[id];
      const next: Participant = {
        id,
        name: data.name ?? existing?.name ?? id,
        color: data.color ?? existing?.color ?? (id === BOT_ID ? "#8B5CF6" : colorForUser(id)),
        avatar: data.avatar !== undefined ? data.avatar : existing?.avatar ?? null,
        banner: data.banner !== undefined ? data.banner : existing?.banner ?? null,
        bannerColor: data.bannerColor !== undefined ? data.bannerColor : existing?.bannerColor ?? null,
        bio: data.bio !== undefined ? data.bio : existing?.bio ?? "",
        status: (data.status as Status) ?? existing?.status ?? "online",
        isBot: data.isBot ?? existing?.isBot ?? id === BOT_ID,
      };
      return { ...prev, [id]: next };
    });
  }, []);

  const resolveMediaUrl = useCallback((url?: string | null) => {
    if (!url) return undefined;
    if (/^(blob:|data:|https?:\/\/)/i.test(url)) return url;
    return `${backendUrl}${url.startsWith("/") ? "" : "/"}${url}`;
  }, [backendUrl]);

  const scopeForChat = useCallback(
    (chatKey: string) => (chatKey === LOBBY ? LOBBY : dmScopeOf(selfIdRef.current, chatKey)),
    []
  );

  const appendMessage = useCallback((chatKey: string, msg: Message) => {
    setChats((prev) => {
      const list = prev[chatKey] || [];
      if (list.some((m) => m.id === msg.id)) return prev;
      // Optimistic UI: el eco del servidor reemplaza al mensaje local pendiente
      const pendingIdx = msg.clientId != null ? list.findIndex((m) => m.id === msg.clientId) : -1;
      const next = pendingIdx !== -1 ? list.map((m, i) => (i === pendingIdx ? msg : m)) : [...list, msg];
      return { ...prev, [chatKey]: next };
    });
    if (msg.authorId === selfIdRef.current) {
      onOwnEchoRef.current?.();
      // Al responder (desde cualquier dispositivo), las sugerencias caducan
      setSmartReplies((prev) => {
        if (!prev[chatKey]) return prev;
        const next = { ...prev };
        delete next[chatKey];
        return next;
      });
    } else if (activeChatRef.current !== chatKey) {
      setUnread((u) => ({ ...u, [chatKey]: (u[chatKey] || 0) + 1 }));
    } else if (!isAtBottomRef.current) {
      setUnreadCount((c) => c + 1);
    }
  }, []);

  /** Actualiza un mensaje por id dentro de un scope del servidor. */
  const patchMessage = useCallback(
    (scope: string | undefined, msgId: string | number, patch: Partial<Message>) => {
      const chatKey = chatKeyFromScope(scope, selfIdRef.current, LOBBY);
      setChats((prev) => {
        const list = prev[chatKey];
        if (!list) return prev;
        return { ...prev, [chatKey]: list.map((m) => (m.id === msgId ? { ...m, ...patch } : m)) };
      });
    },
    []
  );

  // ==========================================
  // CONEXIÓN + LISTENERS
  // ==========================================
  useEffect(() => {
    const newSocket = io(backendUrl);
    setSocket(newSocket);
    socketRef.current = newSocket;

    newSocket.on("connect", () => {
      setIsConnected(true);
      isConnectedRef.current = true;
      let profile: Partial<SessionProfilePayload> = {};
      try {
        const saved = localStorage.getItem("chatProfile");
        if (saved) profile = JSON.parse(saved);
      } catch { /* sin perfil guardado */ }
      newSocket.emit("restore profile", profile);
      // Recuperación tras reconexión: re-sincronizar el DM abierto y avisar
      if (everConnectedRef.current) {
        if (activeChatRef.current && activeChatRef.current !== LOBBY) {
          newSocket.emit("get dm history", { with: activeChatRef.current });
        }
        toast.success("Conexión restablecida");
      }
      everConnectedRef.current = true;
    });

    newSocket.on("disconnect", () => {
      setIsConnected(false);
      isConnectedRef.current = false;
    });

    newSocket.on("session profile", (data: SessionProfilePayload) => {
      if (!data?.userId) return;
      // El servidor solo siembra mi perfil la PRIMERA vez; después lo local manda.
      const firstTime = selfIdRef.current !== data.userId || !participantsRef.current[data.userId];
      setSelfId(data.userId);
      selfIdRef.current = data.userId;
      if (data.friendCode) setFriendCode(data.friendCode);
      if (firstTime) upsertParticipant(data, { allowSelf: true });
    });

    newSocket.on("bot profile", (data: ProfilePayload) => upsertParticipant(data));

    newSocket.on("users online", (list: ProfilePayload[]) => {
      if (!Array.isArray(list)) return;
      setOnlineIds(list.map((p) => p.userId));
      list.forEach((p) => upsertParticipant(p));
    });

    newSocket.on("profile updated", (data: ProfilePayload) => upsertParticipant(data));

    newSocket.on("friends list", (list: ProfilePayload[]) => {
      if (!Array.isArray(list)) return;
      setFriends(list.map((p) => p.userId));
      list.forEach((p) => upsertParticipant(p));
    });

    newSocket.on("friend added", (data: FriendAddedPayload) => {
      if (data?.profile) {
        upsertParticipant(data.profile);
        toast.success(`¡${data.profile.name} ahora es tu amigo!`);
      }
    });

    newSocket.on("friend error", (data: ErrorToastPayload) => {
      toast.error(data?.message || "No se pudo agregar al amigo.");
    });

    newSocket.on("error toast", (data: ErrorToastPayload) => {
      toast.error(data?.message || "Algo salió mal.");
    });

    // Anti-flood del servidor: activar el cooldown visual en el composer
    newSocket.on("rate limited", (data: RateLimitedPayload) => {
      const retryInMs = typeof data?.retryInMs === "number" && data.retryInMs > 0 ? data.retryInMs : 5000;
      const until = Date.now() + retryInMs;
      if (until > cooldownUntilRef.current) {
        cooldownUntilRef.current = until;
        setCooldownUntil(until);
      }
      toast.warning("Vas muy rápido. Espera un momento para volver a enviar.");
    });

    newSocket.on("message history", (history: ServerMessagePayload[]) => {
      if (!Array.isArray(history)) return;
      const formatted = history.map((data) => {
        if (data.profile) upsertParticipant(data.profile);
        return parseServerMessage(data, resolveMediaUrl);
      });
      setChats((prev) => ({ ...prev, [LOBBY]: formatted }));
    });

    newSocket.on("chat message", (data: ServerMessagePayload) => {
      if (data.profile) upsertParticipant(data.profile);
      appendMessage(LOBBY, parseServerMessage(data, resolveMediaUrl));
    });

    newSocket.on("dm message", (data: ServerMessagePayload) => {
      if (data.profile) upsertParticipant(data.profile);
      const peer = data.userId === selfIdRef.current ? data.to : data.userId;
      if (!peer) return;
      appendMessage(peer, parseServerMessage(data, resolveMediaUrl));
    });

    newSocket.on("dm history", (payload: DmHistoryPayload) => {
      if (!payload?.with || !Array.isArray(payload.messages)) return;
      const formatted = payload.messages.map((data) => {
        if (data.profile) upsertParticipant(data.profile);
        return parseServerMessage(data, resolveMediaUrl);
      });
      setChats((prev) => ({ ...prev, [payload.with]: formatted }));
      setHistoryMore((prev) => ({ ...prev, [payload.with]: !!payload.hasMore }));
      const peerRead = payload.reads?.[payload.with];
      if (typeof peerRead === "number") {
        setPeerReads((prev) => (prev[payload.with] >= peerRead ? prev : { ...prev, [payload.with]: peerRead }));
      }
    });

    newSocket.on("history meta", (payload: HistoryMetaPayload) => {
      if (!payload?.with) return;
      const chatKey = payload.with === "lobby" ? LOBBY : payload.with;
      setHistoryMore((prev) => ({ ...prev, [chatKey]: !!payload.hasMore }));
    });

    newSocket.on("older messages", (payload: OlderMessagesPayload) => {
      if (!payload?.with || !Array.isArray(payload.messages)) return;
      const chatKey = payload.with === "lobby" ? LOBBY : payload.with;
      const older = payload.messages.map((data) => {
        if (data.profile) upsertParticipant(data.profile);
        return parseServerMessage(data, resolveMediaUrl);
      });
      setChats((prev) => {
        const list = prev[chatKey] || [];
        const existing = new Set(list.map((m) => m.id));
        const fresh = older.filter((m) => !existing.has(m.id));
        if (fresh.length === 0) return prev;
        return { ...prev, [chatKey]: [...fresh, ...list] };
      });
      setHistoryMore((prev) => ({ ...prev, [chatKey]: !!payload.hasMore }));
    });

    // Resultados de búsqueda del servidor: se fusionan en la conversación
    // (dedupe por id, orden por timestamp) para poder saltar a coincidencias
    // que aún no estaban cargadas por el cursor.
    newSocket.on("search results", (payload: SearchResultsPayload) => {
      if (!payload?.with || !Array.isArray(payload.messages)) return;
      const chatKey = payload.with === "lobby" ? LOBBY : payload.with;
      const parsed = payload.messages.map((data) => {
        if (data.profile) upsertParticipant(data.profile);
        return parseServerMessage(data, resolveMediaUrl);
      });
      setChats((prev) => {
        const list = prev[chatKey] || [];
        const existing = new Set(list.map((m) => m.id));
        const fresh = parsed.filter((m) => !existing.has(m.id));
        if (fresh.length === 0) return prev;
        return { ...prev, [chatKey]: [...list, ...fresh].sort((a, b) => a.timestamp - b.timestamp) };
      });
    });

    newSocket.on("message edited", (payload: MessageEditedPayload) => {
      if (!payload?.msgId || typeof payload.text !== "string") return;
      patchMessage(payload.scope, payload.msgId, { text: payload.text, edited: true });
    });

    newSocket.on("message deleted", (payload: MessageDeletedPayload) => {
      const msgId = payload?.msgId ?? (payload as unknown as string | number);
      // Tombstone: el objeto permanece en la lista (sin saltos de scroll), solo se vacía
      patchMessage(payload?.scope, msgId, {
        deleted: true,
        text: undefined,
        imageUrl: undefined,
        audioUrl: undefined,
        linkPreview: undefined,
        replyTo: undefined,
        reactions: {},
      });
    });

    newSocket.on("reaction updated", (payload: ReactionUpdatedPayload) => {
      if (!payload?.scope || !payload?.msgId) return;
      patchMessage(payload.scope, payload.msgId, { reactions: payload.reactions || {} });
    });

    newSocket.on("link preview", (payload: LinkPreviewPayload) => {
      if (!payload?.msgId || !payload.preview) return;
      patchMessage(payload.scope, payload.msgId, { linkPreview: payload.preview });
    });

    // Smart Replies (IA): chips de respuesta rápida para el DM del scope
    newSocket.on("smart replies", (payload: SmartRepliesPayload) => {
      if (!payload?.scope || !Array.isArray(payload.replies)) return;
      const chatKey = chatKeyFromScope(payload.scope, selfIdRef.current, LOBBY);
      if (chatKey === LOBBY) return;
      const replies = payload.replies.filter((r) => typeof r === "string" && r.trim()).slice(0, 3);
      if (replies.length === 0) return;
      setSmartReplies((prev) => ({ ...prev, [chatKey]: replies }));
    });

    newSocket.on("dm read", (payload: DmReadPayload) => {
      if (!payload?.by || payload.by === selfIdRef.current) return;
      const at = typeof payload.at === "number" ? payload.at : Date.now();
      setPeerReads((prev) => (prev[payload.by] >= at ? prev : { ...prev, [payload.by]: at }));
    });

    // Respuesta del bot en vivo: la burbuja crece con cada fragmento y el
    // mensaje final del servidor la reemplaza (clientId = streamId).
    newSocket.on("bot stream", (payload: BotStreamPayload) => {
      if (!payload?.streamId || typeof payload.text !== "string") return;
      const chatKey = chatKeyFromScope(payload.scope, selfIdRef.current, LOBBY);
      setChats((prev) => {
        const list = prev[chatKey] || [];
        const idx = list.findIndex((m) => m.id === payload.streamId);
        if (idx === -1) {
          const ts = Date.now();
          const msg: Message = {
            id: payload.streamId,
            authorId: BOT_ID,
            kind: "text",
            text: payload.text,
            time: fmtClock(ts),
            timestamp: ts,
            isBot: true,
            streaming: !payload.done,
          };
          return { ...prev, [chatKey]: [...list, msg] };
        }
        return { ...prev, [chatKey]: list.map((m, i) => (i === idx ? { ...m, text: payload.text, streaming: !payload.done } : m)) };
      });
    });

    newSocket.on("typing", (payload: TypingPayload) => {
      if (!payload?.scope || !payload?.userId) return;
      const chatKey = payload.scope === LOBBY ? LOBBY : payload.userId === selfIdRef.current ? payload.scope : payload.userId;
      setTypingUsers((prev) => {
        const inChat = { ...(prev[chatKey] || {}) };
        if (payload.typing) inChat[payload.userId] = payload.name || "Alguien";
        else delete inChat[payload.userId];
        return { ...prev, [chatKey]: inChat };
      });
      if (payload.typing) {
        // Red de seguridad: expirar el indicador si nunca llega typing:false
        setTimeout(() => {
          setTypingUsers((prev) => {
            const inChat = { ...(prev[chatKey] || {}) };
            delete inChat[payload.userId];
            return { ...prev, [chatKey]: inChat };
          });
        }, 8000);
      }
    });

    return () => {
      newSocket.close();
    };
  }, [backendUrl, appendMessage, patchMessage, resolveMediaUrl, upsertParticipant]);

  // ==========================================
  // EFECTOS DERIVADOS
  // ==========================================

  // Sincronizar mi perfil con el servidor cuando cambie
  const meProfile = participants[selfId];
  useEffect(() => {
    if (socket && isConnected && selfId && meProfile) {
      socket.emit("set profile", {
        name: meProfile.name,
        avatar: meProfile.avatar || null,
        color: meProfile.color,
        banner: meProfile.banner || null,
        bannerColor: meProfile.bannerColor || null,
        bio: meProfile.bio || "",
        status: meProfile.status === "offline" ? "online" : meProfile.status,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meProfile?.name, meProfile?.avatar, meProfile?.color, meProfile?.banner, meProfile?.bannerColor, meProfile?.bio, meProfile?.status, isConnected, socket, selfId]);

  // Persistir mi perfil localmente
  useEffect(() => {
    if (selfId && meProfile) {
      localStorage.setItem("chatProfile", JSON.stringify({
        userId: selfId,
        name: meProfile.name,
        color: meProfile.color,
        avatar: meProfile.avatar,
        banner: meProfile.banner,
        bannerColor: meProfile.bannerColor,
        bio: meProfile.bio,
        status: meProfile.status,
      }));
    }
  }, [selfId, meProfile]);

  // Cargar identidad guardada al montar
  useEffect(() => {
    const savedProfile = localStorage.getItem("chatProfile");
    if (!savedProfile) return;
    try {
      const profile = JSON.parse(savedProfile) as SessionProfilePayload;
      if (profile.userId) {
        setSelfId(profile.userId);
        selfIdRef.current = profile.userId;
        upsertParticipant({ ...profile, status: profile.status || "online" }, { allowSelf: true });
      }
    } catch { /* perfil corrupto: empezar de cero */ }
  }, [upsertParticipant]);

  // Medición de latencia (indicador de calidad de conexión)
  useEffect(() => {
    if (!socket || !isConnected) {
      setLatencyMs(null);
      return;
    }
    let cancelled = false;
    const measure = () => {
      const t0 = performance.now();
      socket.timeout(5000).emit("latency ping", (err: unknown) => {
        if (cancelled) return;
        setLatencyMs(err ? null : Math.max(1, Math.round(performance.now() - t0)));
      });
    };
    measure();
    const iv = window.setInterval(measure, 10000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [socket, isConnected]);

  // Confirmaciones de lectura: avisar al peer cuando realmente vi sus mensajes
  useEffect(() => {
    if (!socket || !isConnected || !activeChat || activeChat === LOBBY || !isAtBottom) return;
    if (participants[activeChat]?.isBot) return;
    const list = chats[activeChat] || [];
    let lastPeerTs = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].authorId === activeChat) {
        lastPeerTs = list[i].timestamp;
        break;
      }
    }
    if (lastPeerTs && lastPeerTs > (lastReadSentRef.current[activeChat] || 0)) {
      lastReadSentRef.current[activeChat] = lastPeerTs;
      socket.emit("dm read", { with: activeChat });
    }
  }, [socket, isConnected, activeChat, chats, isAtBottom, participants]);

  // ==========================================
  // ACCIONES PÚBLICAS
  // ==========================================
  const updateMe = useCallback((patch: Partial<Participant>) => {
    const id = selfIdRef.current;
    if (!id) return;
    setParticipants((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || { id, name: id, color: USER_COLORS[0], status: "online" as Status }),
        ...patch,
        id,
      },
    }));
  }, []);

  const emitMessage = useCallback((payload: Record<string, unknown>) => {
    const chatKey = activeChatRef.current || LOBBY;
    if (socketRef.current && isConnectedRef.current) {
      if (chatKey === LOBBY) {
        socketRef.current.emit("chat message", payload);
      } else {
        socketRef.current.emit("dm message", { ...payload, to: chatKey });
      }
      return true;
    }
    return false;
  }, []);

  const emitTyping = useCallback(() => {
    if (!socketRef.current || !isConnectedRef.current || !activeChatRef.current) return;
    const scope = activeChatRef.current === LOBBY ? LOBBY : activeChatRef.current;
    if (!typingSentRef.current) {
      socketRef.current.emit("typing", { scope, typing: true });
      typingSentRef.current = true;
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      typingSentRef.current = false;
      socketRef.current?.emit("typing", { scope, typing: false });
    }, 1800);
  }, []);

  const clearTypingState = useCallback(() => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingSentRef.current = false;
  }, []);

  const requestDmHistory = useCallback((peer: string) => {
    if (socketRef.current && isConnectedRef.current && peer && peer !== LOBBY) {
      socketRef.current.emit("get dm history", { with: peer });
    }
  }, []);

  const requestOlderMessages = useCallback(() => {
    const chatKey = activeChatRef.current || LOBBY;
    const first = (chatsRef.current[chatKey] || [])[0];
    if (!socketRef.current || !isConnectedRef.current || !first) return;
    socketRef.current.emit("get older messages", {
      with: chatKey === LOBBY ? "lobby" : chatKey,
      before: first.timestamp,
    });
  }, []);

  // Anti-flood del lado del cliente: 10 mensajes por ventana de 10s (el
  // servidor permite 12; tropezar aquí primero evita el viaje al socket).
  const CLIENT_RATE_WINDOW_MS = 10000;
  const CLIENT_RATE_MAX = 10;

  const consumeSendSlot = useCallback(() => {
    const now = Date.now();
    if (now < cooldownUntilRef.current) return false;
    const recent = sendTimesRef.current.filter((ts) => now - ts < CLIENT_RATE_WINDOW_MS);
    if (recent.length >= CLIENT_RATE_MAX) {
      sendTimesRef.current = recent;
      const until = recent[0] + CLIENT_RATE_WINDOW_MS;
      cooldownUntilRef.current = until;
      setCooldownUntil(until);
      return false;
    }
    recent.push(now);
    sendTimesRef.current = recent;
    return true;
  }, []);

  const searchMessages = useCallback((query: string) => {
    const chatKey = activeChatRef.current || LOBBY;
    const q = query.trim();
    if (!socketRef.current || !isConnectedRef.current || !q) return;
    socketRef.current.emit("search messages", {
      with: chatKey === LOBBY ? "lobby" : chatKey,
      query: q,
    });
  }, []);

  const isLocalOnly = (id: string | number) => String(id).startsWith("local-") || String(id).startsWith("c-");

  const editMessage = useCallback((msgId: string | number, text: string) => {
    const chatKey = activeChatRef.current || LOBBY;
    // Optimistic UI: aplicar localmente; el eco "message edited" confirma
    setChats((prev) => ({
      ...prev,
      [chatKey]: (prev[chatKey] || []).map((m) => (m.id === msgId ? { ...m, text, edited: true } : m)),
    }));
    if (socketRef.current && isConnectedRef.current && !isLocalOnly(msgId)) {
      socketRef.current.emit("edit message", { scope: scopeForChat(chatKey), msgId, text });
    }
  }, [scopeForChat]);

  const deleteMessage = useCallback((msgId: string | number) => {
    const chatKey = activeChatRef.current || LOBBY;
    // Optimistic UI: tombstone inmediato; el eco "message deleted" confirma.
    // No se quita el objeto de la lista para no provocar saltos de scroll.
    setChats((prev) => ({
      ...prev,
      [chatKey]: (prev[chatKey] || []).map((m) =>
        m.id === msgId
          ? { ...m, deleted: true, text: undefined, imageUrl: undefined, audioUrl: undefined, linkPreview: undefined, replyTo: undefined, reactions: {} }
          : m
      ),
    }));
    if (socketRef.current && isConnectedRef.current && !isLocalOnly(msgId)) {
      socketRef.current.emit("delete message", { scope: scopeForChat(chatKey), msgId });
    }
  }, [scopeForChat]);

  const toggleReaction = useCallback((msgId: string | number, reactionId: string) => {
    const chatKey = activeChatRef.current || LOBBY;
    if (socketRef.current && isConnectedRef.current && !isLocalOnly(msgId)) {
      socketRef.current.emit("reaction", { scope: scopeForChat(chatKey), msgId, reaction: reactionId });
    } else {
      // Fallback local sin conexión
      const me = selfIdRef.current;
      setChats((prev) => ({
        ...prev,
        [chatKey]: (prev[chatKey] || []).map((m) => {
          if (m.id !== msgId) return m;
          const reactions = { ...(m.reactions || {}) };
          const users = reactions[reactionId] || [];
          if (users.includes(me)) {
            reactions[reactionId] = users.filter((u) => u !== me);
            if (reactions[reactionId].length === 0) delete reactions[reactionId];
          } else {
            reactions[reactionId] = [...users, me];
          }
          return { ...m, reactions };
        }),
      }));
    }
  }, [scopeForChat]);

  const addFriend = useCallback((code: string) => {
    if (!code) return;
    if (socketRef.current && isConnectedRef.current) {
      socketRef.current.emit("add friend", { code });
    } else {
      toast.error("Sin conexión con el servidor.");
    }
  }, []);

  const removeFriend = useCallback((userId: string) => {
    const name = participantsRef.current[userId]?.name || userId;
    socketRef.current?.emit("remove friend", { userId });
    toast.info(`${name} eliminado de tus amigos.`);
  }, []);

  const resetUnreadCount = useCallback(() => setUnreadCount(0), []);

  return {
    socket,
    isConnected,
    latencyMs,
    selfId,
    friendCode,
    participants,
    friends,
    onlineIds,
    chats,
    unread,
    unreadCount,
    typingUsers,
    peerReads,
    historyMore,
    smartReplies,
    cooldownUntil,
    consumeSendSlot,
    setChats,
    setUnread,
    resetUnreadCount,
    updateMe,
    scopeForChat,
    resolveMediaUrl,
    emitMessage,
    emitTyping,
    clearTypingState,
    requestDmHistory,
    requestOlderMessages,
    searchMessages,
    editMessage,
    deleteMessage,
    toggleReaction,
    addFriend,
    removeFriend,
  };
}
