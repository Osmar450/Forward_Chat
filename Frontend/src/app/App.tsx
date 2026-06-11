import React, { useState, useRef, useEffect, useMemo } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import { Toaster } from "./components/ui/sonner";
import { WifiOff } from "lucide-react";
import { themes, Theme } from "./lib/themes";
import {
  BOT_ID,
  LOBBY,
  Message,
  Participant,
  ReplyTo,
  Status,
  USER_COLORS,
  colorForUser,
  dmScopeOf,
  downscaleImage,
  fmtClock,
  messagePreview,
  parseServerMessage,
} from "./lib/chat";
import { useWebRTC } from "./hooks/useWebRTC";
import { useAudioRecorder } from "./hooks/useAudioRecorder";
import { Header } from "./components/layout/Header";
import { SideMenu } from "./components/layout/SideMenu";
import { HomeScreen } from "./components/home/HomeScreen";
import { MessageList } from "./components/chat/MessageList";
import { Composer } from "./components/chat/Composer";
import { SearchBar } from "./components/chat/SearchBar";
// Lazy loading: modales y UI de llamadas salen del bundle inicial
const ThemesModal = React.lazy(() => import("./components/modals/ThemesModal").then((m) => ({ default: m.ThemesModal })));
const ImagePreviewModal = React.lazy(() => import("./components/modals/ImagePreviewModal").then((m) => ({ default: m.ImagePreviewModal })));
const MembersModal = React.lazy(() => import("./components/modals/MembersModal").then((m) => ({ default: m.MembersModal })));
const FriendsModal = React.lazy(() => import("./components/modals/FriendsModal").then((m) => ({ default: m.FriendsModal })));
const ProfileViewModal = React.lazy(() => import("./components/modals/ProfileViewModal").then((m) => ({ default: m.ProfileViewModal })));
const ProfileEditModal = React.lazy(() => import("./components/modals/ProfileEditModal").then((m) => ({ default: m.ProfileEditModal })));
const CallOverlay = React.lazy(() => import("./components/call/CallOverlay").then((m) => ({ default: m.CallOverlay })));
const IncomingCallModal = React.lazy(() => import("./components/call/IncomingCallModal").then((m) => ({ default: m.IncomingCallModal })));

export default function App() {
  // ==========================================
  // ESTADO BASE
  // ==========================================
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem("chatTheme") as Theme;
      return saved && Object.keys(themes).includes(saved) ? saved : "dark";
    } catch {
      return "dark";
    }
  });
  const [ecoMode, setEcoMode] = useState(() => {
    try {
      return localStorage.getItem("chatEcoMode") === "1";
    } catch {
      return false;
    }
  });
  // Permisos "lazy": nada se solicita al cargar; solo al llamar, y respetando estos toggles
  const [perms, setPerms] = useState<{ mic: boolean; cam: boolean }>(() => {
    try {
      return { mic: true, cam: true, ...JSON.parse(localStorage.getItem("chatPermissions") || "{}") };
    } catch {
      return { mic: true, cam: true };
    }
  });
  const permsRef = useRef(perms);
  permsRef.current = perms;

  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [selfId, setSelfId] = useState("");
  const [friendCode, setFriendCode] = useState("");
  const [participants, setParticipants] = useState<Record<string, Participant>>({});
  const [friends, setFriends] = useState<string[]>([]);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);

  // Mensajes por conversación: "lobby" o el userId del amigo (DM)
  const [chats, setChats] = useState<Record<string, Message[]>>({ [LOBBY]: [] });
  const [activeChat, setActiveChat] = useState<string | null>(null); // null = pantalla de inicio
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [typingUsers, setTypingUsers] = useState<Record<string, Record<string, string>>>({});

  // UI
  const [menuOpen, setMenuOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showThemes, setShowThemes] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [viewProfileId, setViewProfileId] = useState<string | null>(null);
  const [openMenuFor, setOpenMenuFor] = useState<string | number | null>(null);

  // Composer
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pendingImage, setPendingImage] = useState<{ file: File; previewUrl: string; caption: string } | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [showStickers, setShowStickers] = useState(false);
  const [stickers, setStickers] = useState<string[]>([]);
  const [favoriteStickers, setFavoriteStickers] = useState<string[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  // Confirmaciones de lectura (DMs): peerId -> timestamp de su última lectura
  const [peerReads, setPeerReads] = useState<Record<string, number>>({});
  // Búsqueda dentro del chat activo
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  // Calidad de conexión (RTT del socket en ms)
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  // Divisor "mensajes nuevos" al abrir un chat con pendientes
  const [unreadMarker, setUnreadMarker] = useState<{ chat: string; id: string | number } | null>(null);
  // Paginación por cursor: chatKey -> el servidor tiene mensajes más antiguos
  const [historyMore, setHistoryMore] = useState<Record<string, boolean>>({});

  // Refs para handlers de socket (evitan closures obsoletos)
  const selfIdRef = useRef(selfId);
  const socketRef = useRef<Socket | null>(null);
  const isConnectedRef = useRef(false);
  const replyingToRef = useRef<Message | null>(null);
  const activeChatRef = useRef<string | null>(null);
  const isAtBottomRef = useRef(true);
  const participantsRef = useRef(participants);
  const chatsRef = useRef(chats);
  const typingTimerRef = useRef<number | null>(null);
  const typingSentRef = useRef(false);
  const everConnectedRef = useRef(false);
  const lastReadSentRef = useRef<Record<string, number>>({});
  const prevChatRef = useRef<string | null | undefined>(undefined);

  const scrollRef = useRef<HTMLDivElement>(null);

  const backendUrl = import.meta.env.DEV ? "http://localhost:3000" : (typeof window !== "undefined" ? window.location.origin : "/");
  const t = themes[theme];
  const rtc = useWebRTC(socket, selfId, {
    mic: () => permsRef.current.mic,
    cam: () => permsRef.current.cam,
  });

  selfIdRef.current = selfId;
  socketRef.current = socket;
  isConnectedRef.current = isConnected;
  replyingToRef.current = replyingTo;
  activeChatRef.current = activeChat;
  isAtBottomRef.current = isAtBottom;
  participantsRef.current = participants;
  chatsRef.current = chats;

  const me: Participant = participants[selfId] || {
    id: selfId,
    name: selfId || "Cargando...",
    color: USER_COLORS[0],
    status: "online",
  };
  const draft = drafts[activeChat || LOBBY] || "";
  const activeMessages = activeChat ? chats[activeChat] || [] : [];

  // ==========================================
  // HELPERS DE PARTICIPANTES
  // ==========================================
  const upsertParticipant = (data: any, opts: { allowSelf?: boolean } = {}) => {
    const id = data.userId || data.id;
    if (!id) return;
    // El perfil PROPIO solo lo controlan el "session profile" inicial y mis ediciones locales.
    // Nunca dejamos que perfiles incrustados en mensajes viejos o en la presencia lo reviertan
    // (esa era la causa del bug: al renombrarte, un eco del servidor restauraba el nombre anterior).
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
  };

  const scopeForChat = (chatKey: string) => (chatKey === LOBBY ? LOBBY : dmScopeOf(selfIdRef.current, chatKey));

  const resolveMediaUrl = (url?: string | null) => {
    if (!url) return undefined;
    if (/^(blob:|data:|https?:\/\/)/i.test(url)) return url;
    return `${backendUrl}${url.startsWith("/") ? "" : "/"}${url}`;
  };

  const appendMessage = (chatKey: string, msg: Message) => {
    setChats((prev) => {
      const list = prev[chatKey] || [];
      if (list.some((m) => m.id === msg.id)) return prev;
      // Optimistic UI: el eco del servidor reemplaza al mensaje local pendiente
      const pendingIdx = msg.clientId != null ? list.findIndex((m) => m.id === msg.clientId) : -1;
      const next = pendingIdx !== -1 ? list.map((m, i) => (i === pendingIdx ? msg : m)) : [...list, msg];
      return { ...prev, [chatKey]: next };
    });
    if (msg.authorId === selfIdRef.current) {
      setReplyingTo(null);
    } else if (activeChatRef.current !== chatKey) {
      setUnread((u) => ({ ...u, [chatKey]: (u[chatKey] || 0) + 1 }));
    } else if (!isAtBottomRef.current) {
      setUnreadCount((c) => c + 1);
    }
  };

  // ==========================================
  // PERSISTENCIA LOCAL (tema, eco, perfil, stickers)
  // ==========================================
  useEffect(() => {
    localStorage.setItem("chatTheme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("chatEcoMode", ecoMode ? "1" : "0");
  }, [ecoMode]);

  useEffect(() => {
    localStorage.setItem("chatPermissions", JSON.stringify(perms));
  }, [perms]);

  useEffect(() => {
    const savedProfile = localStorage.getItem("chatProfile");
    if (savedProfile) {
      try {
        const profile = JSON.parse(savedProfile);
        if (profile.userId) {
          setSelfId(profile.userId);
          upsertParticipant({ ...profile, userId: profile.userId, status: profile.status || "online" }, { allowSelf: true });
        }
      } catch (e) {
        console.error("Error loading profile:", e);
      }
    }
    const savedStickers = localStorage.getItem("chatStickers");
    const savedFavs = localStorage.getItem("chatFavoriteStickers");
    try {
      if (savedStickers) setStickers(JSON.parse(savedStickers));
      if (savedFavs) setFavoriteStickers(JSON.parse(savedFavs));
    } catch { /* datos corruptos: ignorar */ }
  }, []);

  useEffect(() => {
    localStorage.setItem("chatStickers", JSON.stringify(stickers));
  }, [stickers]);

  useEffect(() => {
    localStorage.setItem("chatFavoriteStickers", JSON.stringify(favoriteStickers));
  }, [favoriteStickers]);

  useEffect(() => {
    if (selfId && participants[selfId]) {
      const p = participants[selfId];
      localStorage.setItem("chatProfile", JSON.stringify({
        userId: selfId,
        name: p.name,
        color: p.color,
        avatar: p.avatar,
        banner: p.banner,
        bannerColor: p.bannerColor,
        bio: p.bio,
        status: p.status,
      }));
    }
  }, [selfId, participants]);

  // ==========================================
  // SOCKET.IO
  // ==========================================
  useEffect(() => {
    const newSocket = io(backendUrl);
    setSocket(newSocket);
    socketRef.current = newSocket;

    newSocket.on("connect", () => {
      setIsConnected(true);
      isConnectedRef.current = true;
      let profile: any = {};
      try {
        const saved = localStorage.getItem("chatProfile");
        if (saved) profile = JSON.parse(saved);
      } catch { /* sin perfil guardado */ }
      newSocket.emit("restore profile", profile);
      // Recuperación tras reconexión: el servidor reenvía lobby/presencia con
      // "restore profile"; aquí re-sincronizamos el DM abierto y avisamos.
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

    newSocket.on("session profile", (data: any) => {
      if (!data?.userId) return;
      // "Goldilocks": el servidor solo siembra mi perfil la PRIMERA vez (sin datos locales).
      // En reconexiones, lo local (localStorage + ediciones del usuario) es la fuente de
      // verdad y ya viajó al servidor vía 'restore profile' — así un eco viejo no revierte
      // el nombre, pero el input nunca queda bloqueado.
      const firstTime = selfIdRef.current !== data.userId || !participantsRef.current[data.userId];
      setSelfId(data.userId);
      selfIdRef.current = data.userId;
      if (data.friendCode) setFriendCode(data.friendCode);
      if (firstTime) upsertParticipant(data, { allowSelf: true });
    });

    newSocket.on("bot profile", (data: any) => upsertParticipant(data));

    newSocket.on("users online", (list: any[]) => {
      if (!Array.isArray(list)) return;
      setOnlineIds(list.map((p) => p.userId));
      list.forEach((p) => upsertParticipant(p));
    });

    newSocket.on("profile updated", (data: any) => upsertParticipant(data));

    newSocket.on("friends list", (list: any[]) => {
      if (!Array.isArray(list)) return;
      setFriends(list.map((p) => p.userId));
      list.forEach((p) => upsertParticipant(p));
    });

    newSocket.on("friend added", (data: any) => {
      if (data?.profile) {
        upsertParticipant(data.profile);
        toast.success(`¡${data.profile.name} ahora es tu amigo!`);
      }
    });

    newSocket.on("friend error", (data: any) => {
      toast.error(data?.message || "No se pudo agregar al amigo.");
    });

    newSocket.on("error toast", (data: any) => {
      toast.error(data?.message || "Algo salió mal.");
    });

    newSocket.on("message history", (history: any[]) => {
      const formatted = history.map((data) => {
        if (data.profile) upsertParticipant(data.profile);
        return parseServerMessage(data, resolveMediaUrl);
      });
      setChats((prev) => ({ ...prev, [LOBBY]: formatted }));
    });

    newSocket.on("chat message", (data: any) => {
      if (data.profile) upsertParticipant(data.profile);
      appendMessage(LOBBY, parseServerMessage(data, resolveMediaUrl));
    });

    newSocket.on("dm message", (data: any) => {
      if (data.profile) upsertParticipant(data.profile);
      const peer = data.userId === selfIdRef.current ? data.to : data.userId;
      if (!peer) return;
      appendMessage(peer, parseServerMessage(data, resolveMediaUrl));
    });

    newSocket.on("dm history", (payload: any) => {
      if (!payload?.with || !Array.isArray(payload.messages)) return;
      const formatted = payload.messages.map((data: any) => {
        if (data.profile) upsertParticipant(data.profile);
        return parseServerMessage(data, resolveMediaUrl);
      });
      setChats((prev) => ({ ...prev, [payload.with]: formatted }));
      setHistoryMore((prev) => ({ ...prev, [payload.with]: !!payload.hasMore }));
      // El servidor incluye las marcas de lectura del scope (para los checks)
      const peerRead = payload.reads?.[payload.with];
      if (typeof peerRead === "number") {
        setPeerReads((prev) => (prev[payload.with] >= peerRead ? prev : { ...prev, [payload.with]: peerRead }));
      }
    });

    // Paginación: el servidor avisa si hay historial más antiguo disponible
    newSocket.on("history meta", (payload: any) => {
      if (!payload?.with) return;
      const chatKey = payload.with === "lobby" ? LOBBY : payload.with;
      setHistoryMore((prev) => ({ ...prev, [chatKey]: !!payload.hasMore }));
    });

    // Página de mensajes anteriores (cursor): se antepone al historial local
    newSocket.on("older messages", (payload: any) => {
      if (!payload?.with || !Array.isArray(payload.messages)) return;
      const chatKey = payload.with === "lobby" ? LOBBY : payload.with;
      const older = payload.messages.map((data: any) => {
        if (data.profile) upsertParticipant(data.profile);
        return parseServerMessage(data, resolveMediaUrl);
      });
      setChats((prev) => {
        const list = prev[chatKey] || [];
        const existing = new Set(list.map((m) => m.id));
        const fresh = older.filter((m: Message) => !existing.has(m.id));
        if (fresh.length === 0) return prev;
        return { ...prev, [chatKey]: [...fresh, ...list] };
      });
      setHistoryMore((prev) => ({ ...prev, [chatKey]: !!payload.hasMore }));
    });

    newSocket.on("message edited", (payload: any) => {
      if (!payload?.msgId || typeof payload.text !== "string") return;
      const scope = payload.scope || LOBBY;
      const chatKey = scope === LOBBY ? LOBBY : scope.split("|").find((p: string) => p !== selfIdRef.current) || scope;
      setChats((prev) => {
        const list = prev[chatKey];
        if (!list) return prev;
        return { ...prev, [chatKey]: list.map((m) => (m.id === payload.msgId ? { ...m, text: payload.text, edited: true } : m)) };
      });
    });

    newSocket.on("dm read", (payload: any) => {
      if (!payload?.by || payload.by === selfIdRef.current) return;
      const at = typeof payload.at === "number" ? payload.at : Date.now();
      setPeerReads((prev) => (prev[payload.by] >= at ? prev : { ...prev, [payload.by]: at }));
    });

    // Respuesta del bot en vivo: la burbuja crece con cada fragmento y el
    // mensaje final del servidor la reemplaza (clientId = streamId).
    newSocket.on("bot stream", (payload: any) => {
      if (!payload?.streamId || typeof payload.text !== "string") return;
      const scope = payload.scope || LOBBY;
      const chatKey = scope === LOBBY ? LOBBY : scope.split("|").find((p: string) => p !== selfIdRef.current) || scope;
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

    newSocket.on("reaction updated", (payload: any) => {
      if (!payload?.scope || !payload?.msgId) return;
      const chatKey = payload.scope === LOBBY ? LOBBY : payload.scope.split("|").find((p: string) => p !== selfIdRef.current) || payload.scope;
      setChats((prev) => {
        const list = prev[chatKey];
        if (!list) return prev;
        return {
          ...prev,
          [chatKey]: list.map((m) => (m.id === payload.msgId ? { ...m, reactions: payload.reactions || {} } : m)),
        };
      });
    });

    newSocket.on("message deleted", (payload: any) => {
      const msgId = payload?.msgId ?? payload;
      const scope = payload?.scope || LOBBY;
      const chatKey = scope === LOBBY ? LOBBY : scope.split("|").find((p: string) => p !== selfIdRef.current) || scope;
      setChats((prev) => {
        const list = prev[chatKey];
        if (!list) return prev;
        return { ...prev, [chatKey]: list.map((m) => (m.id === msgId ? { ...m, deleted: true } : m)) };
      });
    });

    newSocket.on("typing", (payload: any) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl]);

  // Sincronizar mi perfil con el servidor cuando cambie
  useEffect(() => {
    if (socket && isConnected && selfId && participants[selfId]) {
      const p = participants[selfId];
      socket.emit("set profile", {
        name: p.name,
        avatar: p.avatar || null,
        color: p.color,
        banner: p.banner || null,
        bannerColor: p.bannerColor || null,
        bio: p.bio || "",
        status: p.status === "offline" ? "online" : p.status,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants[selfId]?.name, participants[selfId]?.avatar, participants[selfId]?.color, participants[selfId]?.banner, participants[selfId]?.bannerColor, participants[selfId]?.bio, participants[selfId]?.status, isConnected, socket, selfId]);

  // Pedir historial del DM al abrirlo
  useEffect(() => {
    if (activeChat && activeChat !== LOBBY && socket && isConnected) {
      socket.emit("get dm history", { with: activeChat });
    }
    if (activeChat) {
      // Marcar el primer mensaje no leído para el divisor "Mensajes nuevos"
      const count = unread[activeChat] || 0;
      const list = chatsRef.current[activeChat] || [];
      setUnreadMarker(count > 0 && list.length >= count ? { chat: activeChat, id: list[list.length - count].id } : null);
      setUnread((u) => ({ ...u, [activeChat]: 0 }));
      setUnreadCount(0);
      setReplyingTo(null);
      setEditingMsg(null);
      setShowStickers(false);
      setMentionSearch(null);
      setSearchOpen(false);
      setSearchQuery("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat, isConnected]);

  // Scroll automático que respeta la posición de lectura: solo baja si el
  // usuario ya estaba al fondo o si el último mensaje es propio.
  const lastMsg = activeMessages[activeMessages.length - 1];
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const chatChanged = prevChatRef.current !== activeChat;
    prevChatRef.current = activeChat;
    if (chatChanged) {
      el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
      return;
    }
    if (isAtBottomRef.current || (lastMsg && lastMsg.authorId === selfId)) {
      el.scrollTo({ top: el.scrollHeight, behavior: ecoMode ? "auto" : "smooth" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMessages.length, lastMsg?.text, activeChat, ecoMode, selfId]);

  // Medición de latencia del socket (indicador de calidad de conexión)
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

  // Listener de scroll (botón "ir abajo" + contador)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 100;
      setIsAtBottom(atBottom);
      isAtBottomRef.current = atBottom;
      if (atBottom) setUnreadCount(0);
    };
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [activeChat]);

  // Tecla Escape cierra modales
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setShowProfile(false);
        setShowThemes(false);
        setShowFriends(false);
        setShowMembers(false);
        setViewProfileId(null);
        setPendingImage(null);
        setReplyingTo(null);
        setEditingMsg(null);
        setMentionSearch(null);
        setShowStickers(false);
        setSearchOpen(false);
        setSearchQuery("");
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  // ==========================================
  // ACCIONES DE PERFIL
  // ==========================================
  const updateMe = (patch: Partial<Participant>) => {
    if (!selfId) return;
    setParticipants((prev) => ({ ...prev, [selfId]: { ...(prev[selfId] || me), ...patch, id: selfId } }));
  };

  const handleAvatarFile = async (file: File) => {
    try {
      const dataUrl = await downscaleImage(file, 256);
      updateMe({ avatar: dataUrl });
      toast.success("Foto de perfil actualizada");
    } catch {
      toast.error("No se pudo procesar la imagen");
    }
  };

  const handleBannerFile = async (file: File) => {
    try {
      const dataUrl = await downscaleImage(file, 1024, 0.8);
      updateMe({ banner: dataUrl, bannerColor: null });
      toast.success("Banner actualizado");
    } catch {
      toast.error("No se pudo procesar la imagen");
    }
  };

  const copyFriendCode = () => {
    if (!friendCode) return;
    navigator.clipboard?.writeText(friendCode)
      .then(() => toast.success("Forward Token copiado al portapapeles"))
      .catch(() => toast.error("No se pudo copiar"));
  };

  const submitAddFriend = (code: string) => {
    if (!code) return;
    if (socket && isConnected) {
      socket.emit("add friend", { code });
    } else {
      toast.error("Sin conexión con el servidor.");
    }
  };

  const removeFriend = (fid: string) => {
    const name = participants[fid]?.name || fid;
    socket?.emit("remove friend", { userId: fid });
    toast.info(`${name} eliminado de tus amigos.`);
  };

  // ==========================================
  // MENCIONES (solo lobby)
  // ==========================================
  const mentionables = useMemo(
    () => Object.values(participants).filter((p) => p.id !== selfId),
    [participants, selfId]
  );

  const filteredMentions = mentionables
    .filter((p) => mentionSearch !== null && p.name && p.name.toLowerCase().includes(mentionSearch.toLowerCase()))
    .slice(0, 5);

  const setDraft = (val: string) => setDrafts((d) => ({ ...d, [activeChat || LOBBY]: val }));

  const insertMention = (p: Participant) => {
    const lastAt = draft.lastIndexOf("@");
    if (lastAt !== -1) {
      setDraft(draft.substring(0, lastAt) + "@" + p.name + " ");
    }
    setMentionSearch(null);
  };

  const emitTyping = () => {
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
  };

  const onDraftChange = (val: string) => {
    setDraft(val);
    emitTyping();
    if (activeChat === LOBBY) {
      const lastAt = val.lastIndexOf("@");
      const lastSpace = val.lastIndexOf(" ");
      if (lastAt !== -1 && lastAt > lastSpace) {
        setMentionSearch(val.substring(lastAt + 1));
        setMentionIndex(0);
      } else {
        setMentionSearch(null);
      }
    }
  };

  const onDraftKeyDown = (e: React.KeyboardEvent) => {
    if (mentionSearch !== null && filteredMentions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % filteredMentions.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + filteredMentions.length) % filteredMentions.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(filteredMentions[mentionIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setMentionSearch(null);
      }
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendText();
    }
  };

  // useCallback: identidad estable para que React.memo de las burbujas funcione
  const formatText = React.useCallback((text?: string) => {
    if (!text) return "";
    const names = Object.values(participantsRef.current)
      .map((p) => p.name)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    if (names.length === 0) return text;
    const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const regex = new RegExp(`(@(?:${escaped.join("|")}))`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        const name = part.slice(1);
        const p = Object.values(participantsRef.current).find((x) => x.name && x.name.toLowerCase() === name.toLowerCase());
        if (p) return <span key={i} className="font-bold px-1 rounded bg-white/10" style={{ color: p.color }}>@{p.name}</span>;
      }
      return part;
    });
  }, []);

  // ==========================================
  // ENVÍO DE MENSAJES
  // ==========================================
  const buildReplyRef = (source: Message | null): ReplyTo | undefined => {
    if (!source || source.deleted) return undefined;
    const authorName = source.authorId === selfId ? me.name : participantsRef.current[source.authorId]?.name || "anónimo";
    return {
      id: source.id,
      authorId: source.authorId,
      authorName,
      kind: source.kind,
      text: messagePreview(source.kind, source.text),
    };
  };

  const emitMessage = (payload: Record<string, unknown>) => {
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
  };

  const appendLocal = (msg: Omit<Message, "id" | "time" | "timestamp">) => {
    const ts = Date.now();
    const local: Message = {
      ...msg,
      id: `local-${ts}-${Math.random().toString(36).slice(2, 7)}`,
      time: fmtClock(ts),
      timestamp: ts,
    };
    setChats((prev) => ({ ...prev, [activeChatRef.current || LOBBY]: [...(prev[activeChatRef.current || LOBBY] || []), local] }));
    setReplyingTo(null);
  };

  const sendTextValue = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    const replyTo = buildReplyRef(replyingToRef.current);
    const chatKey = activeChatRef.current || LOBBY;
    // Optimistic UI: pintar de inmediato; el eco del servidor lo confirma vía clientId
    const clientMsgId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const ts = Date.now();
    setChats((prev) => ({
      ...prev,
      [chatKey]: [...(prev[chatKey] || []), { id: clientMsgId, authorId: selfId, kind: "text" as const, text, replyTo, time: fmtClock(ts), timestamp: ts, pending: true }],
    }));
    setReplyingTo(null);
    if (emitMessage({ msgId: clientMsgId, text, replyTo })) {
      // Rollback silencioso: si en 10s el servidor no confirmó, quitar la marca de pendiente
      setTimeout(() => {
        setChats((prev) => {
          const list = prev[chatKey] || [];
          if (!list.some((m) => m.id === clientMsgId && m.pending)) return prev;
          return { ...prev, [chatKey]: list.map((m) => (m.id === clientMsgId ? { ...m, pending: false } : m)) };
        });
      }, 10000);
    } else {
      setChats((prev) => ({
        ...prev,
        [chatKey]: (prev[chatKey] || []).map((m) => (m.id === clientMsgId ? { ...m, pending: false } : m)),
      }));
      toast.warning("Sin conexión: el mensaje solo es visible para ti.");
    }
    setMentionSearch(null);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingSentRef.current = false;
  };

  const sendText = () => {
    if (!draft.trim()) return;
    sendTextValue(draft);
    setDraft("");
  };

  // Pedir al servidor la página anterior del historial (cursor = primer mensaje)
  const requestOlderMessages = () => {
    const chatKey = activeChatRef.current || LOBBY;
    const first = (chatsRef.current[chatKey] || [])[0];
    if (!socketRef.current || !isConnectedRef.current || !first) return;
    socketRef.current.emit("get older messages", {
      with: chatKey === LOBBY ? "lobby" : chatKey,
      before: first.timestamp,
    });
  };

  // Acciones rápidas del bot: enviar la sugerencia tal cual
  const sendQuickSuggestion = (text: string) => {
    sendTextValue(text);
  };

  // ==========================================
  // EDICIÓN DE MENSAJES
  // ==========================================
  const startEditing = (m: Message) => {
    if (m.deleted || m.kind !== "text" || m.authorId !== selfId) return;
    setReplyingTo(null);
    setShowStickers(false);
    setEditingMsg(m);
    setOpenMenuFor(null);
  };

  const submitEdit = (text: string) => {
    const m = editingMsg;
    if (!m) return;
    const trimmed = text.trim();
    if (!trimmed || trimmed === m.text) {
      setEditingMsg(null);
      return;
    }
    const chatKey = activeChatRef.current || LOBBY;
    // Optimistic UI: aplicar localmente; el eco "message edited" confirma
    setChats((prev) => ({
      ...prev,
      [chatKey]: (prev[chatKey] || []).map((x) => (x.id === m.id ? { ...x, text: trimmed, edited: true } : x)),
    }));
    const isLocalOnly = String(m.id).startsWith("local-") || String(m.id).startsWith("c-");
    if (socket && isConnected && !isLocalOnly) {
      socket.emit("edit message", { scope: scopeForChat(chatKey), msgId: m.id, text: trimmed });
    }
    setEditingMsg(null);
  };

  const sendSticker = (url: string) => {
    const replyTo = buildReplyRef(replyingTo);
    if (!emitMessage({ kind: "sticker", imageUrls: [url], replyTo })) {
      appendLocal({ authorId: selfId, kind: "sticker", imageUrl: url, replyTo });
    }
    setShowStickers(false);
  };

  const uploadFiles = async (files: File[]) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    const res = await fetch(`${backendUrl}/upload`, { method: "POST", body: form });
    if (!res.ok) throw new Error("Error subiendo archivo");
    const json = await res.json();
    return Array.isArray(json.files) ? json.files : [];
  };

  const queueImage = (file: File) => {
    const previewUrl = URL.createObjectURL(file);
    setPendingImage({ file, previewUrl, caption: "" });
  };

  const confirmSendImage = async () => {
    if (!pendingImage) return;
    const caption = pendingImage.caption.trim() || undefined;
    const replyTo = buildReplyRef(replyingToRef.current);
    const previewUrl = pendingImage.previewUrl;
    const file = pendingImage.file;
    setPendingImage(null);
    if (socketRef.current && isConnectedRef.current) {
      try {
        const uploaded = await uploadFiles([file]);
        const uploadedUrl = resolveMediaUrl(uploaded[0]?.url);
        if (!uploadedUrl) throw new Error("upload");
        emitMessage({ imageUrls: [uploadedUrl], text: caption, replyTo });
        URL.revokeObjectURL(previewUrl);
        return;
      } catch {
        toast.error("No se pudo subir la imagen; se muestra solo localmente.");
      }
    }
    appendLocal({ authorId: selfId, kind: "image", imageUrl: previewUrl, text: caption, replyTo });
  };

  // Grabación de notas de voz
  const { recording, recordSeconds, startRecording, stopRecording } = useAudioRecorder(
    async (file, duration, localUrl) => {
      const replyTo = buildReplyRef(replyingToRef.current);
      if (socketRef.current && isConnectedRef.current) {
        try {
          const uploaded = await uploadFiles([file]);
          const uploadedUrl = resolveMediaUrl(uploaded[0]?.url);
          if (!uploadedUrl) throw new Error("upload");
          emitMessage({ audioUrl: uploadedUrl, audioDuration: duration, replyTo });
          return;
        } catch {
          toast.error("No se pudo subir el audio; se muestra solo localmente.");
        }
      }
      appendLocal({ authorId: selfId, kind: "audio", audioUrl: localUrl, audioDuration: duration, replyTo });
    }
  );

  const deleteMessage = (id: string | number) => {
    const chatKey = activeChatRef.current || LOBBY;
    if (socket && isConnected && !String(id).startsWith("local-")) {
      socket.emit("delete message", { scope: scopeForChat(chatKey), msgId: id });
    } else {
      setChats((prev) => ({
        ...prev,
        [chatKey]: (prev[chatKey] || []).map((m) => (m.id === id ? { ...m, deleted: true } : m)),
      }));
    }
    setOpenMenuFor(null);
  };

  const toggleReaction = (id: string | number, reactionId: string) => {
    const chatKey = activeChatRef.current || LOBBY;
    if (socket && isConnected && !String(id).startsWith("local-")) {
      socket.emit("reaction", { scope: scopeForChat(chatKey), msgId: id, reaction: reactionId });
    } else {
      // Fallback local sin conexión
      setChats((prev) => ({
        ...prev,
        [chatKey]: (prev[chatKey] || []).map((m) => {
          if (m.id !== id) return m;
          const reactions = { ...(m.reactions || {}) };
          const users = reactions[reactionId] || [];
          if (users.includes(selfId)) {
            reactions[reactionId] = users.filter((u) => u !== selfId);
            if (reactions[reactionId].length === 0) delete reactions[reactionId];
          } else {
            reactions[reactionId] = [...users, selfId];
          }
          return { ...m, reactions };
        }),
      }));
    }
    setOpenMenuFor(null);
  };

  // ==========================================
  // STICKERS
  // ==========================================
  const saveSticker = (url: string) => {
    if (!stickers.includes(url)) {
      setStickers((prev) => [url, ...prev]);
      toast.success("¡Sticker guardado en tu panel!");
    } else {
      toast.info("Este sticker ya está en tu colección.");
    }
  };

  const toggleFavoriteSticker = (url: string) => {
    setFavoriteStickers((prev) => (prev.includes(url) ? prev.filter((s) => s !== url) : [...prev, url]));
  };

  const handleStickerFile = async (file: File) => {
    try {
      const url = await downscaleImage(file, 320);
      setStickers((prev) => [url, ...prev]);
    } catch {
      toast.error("No se pudo procesar el sticker");
    }
  };

  const closeAllOverlays = () => {
    setMenuOpen(false);
    setShowProfile(false);
    setShowThemes(false);
    setShowFriends(false);
    setShowMembers(false);
    setViewProfileId(null);
    setPendingImage(null);
    setShowStickers(false);
  };

  // ==========================================
  // DATOS DERIVADOS PARA LA UI
  // ==========================================
  const lastOf = (key: string) => {
    const list = chats[key];
    return list && list.length > 0 ? list[list.length - 1] : null;
  };

  const dmList = useMemo(() => {
    const ids = new Set<string>([BOT_ID, ...friends]);
    // Incluir DMs con historial aunque ya no sean amigos
    Object.keys(chats).forEach((k) => {
      if (k !== LOBBY) ids.add(k);
    });
    ids.delete(selfId);
    return Array.from(ids).sort((a, b) => {
      if (a === BOT_ID) return -1;
      if (b === BOT_ID) return 1;
      return (lastOf(b)?.timestamp || 0) - (lastOf(a)?.timestamp || 0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friends, chats, selfId]);

  const onlineCount = onlineIds.filter((id) => id !== BOT_ID).length;
  const activePeer = activeChat && activeChat !== LOBBY ? participants[activeChat] : null;
  const typingNames = activeChat
    ? Object.entries(typingUsers[activeChat] || {})
        .filter(([uid]) => uid !== selfId)
        .map(([, n]) => n)
    : [];
  const canSend = draft.trim().length > 0;
  const inChat = activeChat !== null;

  // ==========================================
  // BÚSQUEDA EN EL CHAT ACTIVO
  // ==========================================
  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!searchOpen || !q || !activeChat) return [] as (string | number)[];
    return (chats[activeChat] || [])
      .filter((m) => !m.deleted && m.text && m.text.toLowerCase().includes(q))
      .map((m) => m.id);
  }, [searchOpen, searchQuery, activeChat, chats]);

  // Al cambiar la consulta, posicionarse en la coincidencia más reciente
  useEffect(() => {
    setSearchIndex(searchMatches.length > 0 ? searchMatches.length - 1 : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, activeChat]);

  // Desplazarse a la coincidencia actual
  useEffect(() => {
    const id = searchMatches[searchIndex];
    if (id == null || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(`[data-msgid="${CSS.escape(String(id))}"]`);
    el?.scrollIntoView({ block: "center", behavior: ecoMode ? "auto" : "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchIndex, searchMatches.length, searchOpen]);

  const currentSearchId = searchOpen && searchMatches.length > 0 ? searchMatches[searchIndex] : null;

  // Sugerencias rápidas para el chat con el bot
  const botSuggestions = useMemo(
    () =>
      activeChat && participants[activeChat]?.isBot
        ? ["Cuéntame un chiste", "Dibuja un gato astronauta", "Dame un dato curioso", "Ayúdame con una idea"]
        : [],
    [activeChat, participants]
  );
  const overlayOpen = !!(showThemes || showProfile || menuOpen || viewProfileId || pendingImage || showFriends || showMembers);

  const bannerStyleFor = (p: Participant | null | undefined): React.CSSProperties => {
    if (!p) return { backgroundColor: t.accentHex };
    if (p.bannerColor) return { backgroundColor: p.bannerColor };
    return { backgroundColor: p.color || t.accentHex };
  };

  // ==========================================
  // RENDER
  // ==========================================
  return (
    <MotionConfig reducedMotion={ecoMode ? "always" : "user"}>
    <div className={`size-full min-h-screen ${t.bg} ${t.text} flex items-center justify-center font-mono transition-colors duration-500`}>
      <Toaster position="top-center" expand={false} richColors />
      <div className={`relative w-full max-w-md h-[100dvh] md:h-[90vh] md:rounded-2xl overflow-hidden flex flex-col ${t.border} border ${t.bg}`}>
        <Header
          theme={t}
          me={me}
          inChat={inChat}
          activeChat={activeChat}
          activePeer={activePeer}
          typingNames={typingNames}
          onlineCount={onlineCount}
          rtc={rtc}
          latencyMs={latencyMs}
          isConnected={isConnected}
          searchOpen={searchOpen}
          showBackIcon={overlayOpen || inChat}
          onNavClick={() => {
            if (overlayOpen) {
              closeAllOverlays();
            } else if (inChat) {
              setActiveChat(null);
            } else {
              setMenuOpen(true);
            }
          }}
          onOpenProfile={() => setShowProfile(true)}
          onOpenMembers={() => setShowMembers(true)}
          onViewPeerProfile={() => activeChat && activeChat !== LOBBY && setViewProfileId(activeChat)}
          onSetStatus={(s) => updateMe({ status: s })}
          onToggleSearch={() => {
            setSearchOpen((o) => {
              if (o) setSearchQuery("");
              return !o;
            });
          }}
        />

        {/* Aviso de reconexión */}
        <AnimatePresence>
          {!isConnected && (
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              className="absolute top-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/90 text-white text-xs shadow-lg"
            >
              <WifiOff className="size-3.5" />
              Reconectando...
            </motion.div>
          )}
        </AnimatePresence>

        {/* ============ CONTENIDO ============ */}
        {!inChat ? (
          <HomeScreen
            theme={t}
            selfId={selfId}
            participants={participants}
            dmList={dmList}
            lastOf={lastOf}
            unread={unread}
            onlineCount={onlineCount}
            onOpenChat={(id) => setActiveChat(id)}
            onAddFriend={() => setShowFriends(true)}
          />
        ) : (
          <>
            <SearchBar
              open={searchOpen}
              theme={t}
              query={searchQuery}
              matchCount={searchMatches.length}
              matchIndex={searchIndex}
              onChange={setSearchQuery}
              onPrev={() => setSearchIndex((i) => (searchMatches.length ? (i - 1 + searchMatches.length) % searchMatches.length : 0))}
              onNext={() => setSearchIndex((i) => (searchMatches.length ? (i + 1) % searchMatches.length : 0))}
              onClose={() => {
                setSearchOpen(false);
                setSearchQuery("");
              }}
            />
            <MessageList
              theme={t}
              activeChat={activeChat!}
              activePeer={activePeer}
              messages={activeMessages}
              participants={participants}
              selfId={selfId}
              scrollRef={scrollRef}
              isAtBottom={isAtBottom}
              isConnected={isConnected}
              unreadCount={unreadCount}
              unreadMarkerId={unreadMarker && unreadMarker.chat === activeChat ? unreadMarker.id : null}
              peerReadAt={activeChat !== LOBBY ? peerReads[activeChat!] || 0 : 0}
              showReceipts={activeChat !== LOBBY && !activePeer?.isBot}
              searchActive={searchOpen && searchQuery.trim().length > 0}
              currentSearchId={currentSearchId}
              serverHasMore={!!historyMore[activeChat!]}
              onLoadOlder={requestOlderMessages}
              openMenuFor={openMenuFor}
              onTogglePicker={(id) => setOpenMenuFor((cur) => (cur === id ? null : id))}
              onClosePicker={() => setOpenMenuFor(null)}
              onDelete={deleteMessage}
              onReact={toggleReaction}
              onReply={(m) => setReplyingTo(m)}
              onEdit={startEditing}
              onViewProfile={(id) => setViewProfileId(id)}
              onSaveSticker={saveSticker}
              formatText={formatText}
              onScrollToBottom={() => {
                scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
                setUnreadCount(0);
              }}
            />

            <Composer
              theme={t}
              activeChat={activeChat!}
              activePeer={activePeer}
              selfId={selfId}
              participants={participants}
              draft={draft}
              canSend={canSend}
              onDraftChange={onDraftChange}
              onKeyDown={onDraftKeyDown}
              onSend={sendText}
              replyingTo={replyingTo}
              onCancelReply={() => setReplyingTo(null)}
              editingMsg={editingMsg}
              onSubmitEdit={submitEdit}
              onCancelEdit={() => setEditingMsg(null)}
              quickSuggestions={activeMessages.length <= 1 ? botSuggestions : []}
              onQuickSuggestion={sendQuickSuggestion}
              showStickers={showStickers}
              onToggleStickers={() => setShowStickers(!showStickers)}
              onCloseStickers={() => setShowStickers(false)}
              stickers={stickers}
              favoriteStickers={favoriteStickers}
              onSendSticker={sendSticker}
              onToggleFavoriteSticker={toggleFavoriteSticker}
              onUploadSticker={handleStickerFile}
              recording={recording}
              recordSeconds={recordSeconds}
              onStartRecording={startRecording}
              onStopRecording={stopRecording}
              onPickImage={queueImage}
              mentionSearch={mentionSearch}
              filteredMentions={filteredMentions}
              mentionIndex={mentionIndex}
              onHoverMention={setMentionIndex}
              onInsertMention={insertMention}
            />
          </>
        )}

        {/* ============ MENÚ LATERAL Y MODALES ============ */}
        <SideMenu
          open={menuOpen}
          theme={t}
          me={me}
          perms={perms}
          ecoMode={ecoMode}
          friendCode={friendCode}
          latencyMs={latencyMs}
          isConnected={isConnected}
          bannerStyleFor={bannerStyleFor}
          onClose={closeAllOverlays}
          onEditProfile={() => { setMenuOpen(false); setShowProfile(true); }}
          onOpenFriends={() => { setMenuOpen(false); setShowFriends(true); }}
          onOpenThemes={() => { setMenuOpen(false); setShowThemes(true); }}
          onToggleMic={() => {
            setPerms((p) => {
              const next = { ...p, mic: !p.mic };
              toast.info(next.mic ? "Micrófono habilitado para llamadas" : "Micrófono deshabilitado: no podrás llamar ni contestar.");
              return next;
            });
          }}
          onToggleCam={() => {
            setPerms((p) => {
              const next = { ...p, cam: !p.cam };
              toast.info(next.cam ? "Cámara habilitada para videollamadas" : "Cámara deshabilitada: las videollamadas quedan bloqueadas.");
              return next;
            });
          }}
          onToggleEco={() => {
            setEcoMode((v) => !v);
            toast.success(ecoMode ? "Modo Eco desactivado" : "Modo Eco activado: menos animaciones, menos batería");
          }}
          onClearChat={() => {
            setChats((prev) => ({ ...prev, [activeChatRef.current || LOBBY]: [] }));
            toast.info("Chat limpiado localmente (solo en tu pantalla).");
          }}
          onCopyFriendCode={copyFriendCode}
        />

        <React.Suspense fallback={null}>
        <ThemesModal
          open={showThemes}
          theme={theme}
          themeTokens={t}
          onSetTheme={setTheme}
          onClose={() => setShowThemes(false)}
        />

        <ImagePreviewModal
          pendingImage={pendingImage}
          theme={t}
          onChangeCaption={(caption) => setPendingImage((p) => (p ? { ...p, caption } : p))}
          onSend={confirmSendImage}
          onClose={() => {
            if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
            setPendingImage(null);
          }}
        />

        <MembersModal
          open={showMembers}
          theme={t}
          onlineIds={onlineIds}
          participants={participants}
          selfId={selfId}
          onClose={() => setShowMembers(false)}
          onViewProfile={(id) => setViewProfileId(id)}
        />

        <FriendsModal
          open={showFriends}
          theme={t}
          friendCode={friendCode}
          friends={friends}
          participants={participants}
          onCopyCode={copyFriendCode}
          onAddFriend={submitAddFriend}
          onClose={() => setShowFriends(false)}
          onViewProfile={(id) => setViewProfileId(id)}
          onOpenChat={(id) => setActiveChat(id)}
          onRemoveFriend={removeFriend}
        />

        <ProfileViewModal
          profile={viewProfileId ? participants[viewProfileId] || null : null}
          theme={t}
          selfId={selfId}
          friends={friends}
          bannerStyleFor={bannerStyleFor}
          onClose={() => setViewProfileId(null)}
          onEditProfile={() => setShowProfile(true)}
          onOpenChat={(id) => setActiveChat(id)}
        />

        <ProfileEditModal
          open={showProfile}
          me={me}
          theme={t}
          friendCode={friendCode}
          bannerStyleFor={bannerStyleFor}
          updateMe={updateMe}
          onPickAvatar={handleAvatarFile}
          onPickBanner={handleBannerFile}
          onCopyCode={copyFriendCode}
          onClose={() => setShowProfile(false)}
        />

        {/* ============ LLAMADAS (WebRTC) ============ */}
        <IncomingCallModal rtc={rtc} participants={participants} theme={t} />
        <CallOverlay rtc={rtc} participants={participants} selfId={selfId} theme={t} />
        </React.Suspense>
      </div>
    </div>
    </MotionConfig>
  );
}
