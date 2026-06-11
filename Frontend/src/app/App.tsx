import React, { useState, useRef, useEffect, useMemo } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import { Toaster } from "./components/ui/sonner";
import {
  Menu,
  MessageSquare,
  Send,
  ArrowLeft,
  Image as ImageIcon,
  Mic,
  User,
  Trash2,
  Palette,
  Sticker,
  X,
  Check,
  MessagesSquare,
  Sun,
  Moon,
  Pencil,
  Camera,
  Star,
  Sparkles,
  ChevronDown,
  ChevronsDown,
  UserPlus,
  Reply,
  Hash,
  Users,
  Copy,
  Leaf,
  Bot,
  AtSign,
  KeyRound,
  UserMinus,
  WifiOff,
  Pipette,
  Phone,
  Video,
} from "lucide-react";
import { themes, Theme, ThemeTokens, getThemeBgColor } from "./lib/themes";
import {
  Message,
  MessageKind,
  Participant,
  ReplyTo,
  Status,
  STATUSES,
  USER_COLORS,
  BANNER_COLORS,
  colorForUser,
  downscaleImage,
  fmtClock,
  fmtTime,
  messagePreview,
  parseServerMessage,
  pickRecorderMimeType,
} from "./lib/chat";
import { MessageBubble, StatusDot } from "./components/chat/MessageBubble";
import { useWebRTC } from "./lib/useWebRTC";
import { CallOverlay } from "./components/call/CallOverlay";
import { IncomingCallModal } from "./components/call/IncomingCallModal";

const BOT_ID = "forwardbot";
const LOBBY = "lobby";

const dmScopeOf = (a: string, b: string) => [a, b].sort().join("|");

function CloseButton({
  onClick,
  className = "",
  size = "default",
}: {
  onClick: () => void;
  className?: string;
  size?: "default" | "small";
}) {
  const pad = size === "small" ? "p-1.5" : "p-2";
  return (
    <motion.button
      whileHover={{ rotate: 90, scale: 1.1 }}
      whileTap={{ scale: 0.85, rotate: 180 }}
      transition={{ type: "spring", stiffness: 400, damping: 18 }}
      onClick={onClick}
      aria-label="Cerrar"
      className={`${pad} rounded-lg ${className}`}
    >
      <X className="size-4" />
    </motion.button>
  );
}

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
  const [statusOpen, setStatusOpen] = useState(false);
  const [openMenuFor, setOpenMenuFor] = useState<string | number | null>(null);

  // Composer
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pendingImage, setPendingImage] = useState<{ file: File; previewUrl: string; caption: string } | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showStickers, setShowStickers] = useState(false);
  const [stickers, setStickers] = useState<string[]>([]);
  const [favoriteStickers, setFavoriteStickers] = useState<string[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [friendCodeInput, setFriendCodeInput] = useState("");

  // Editor de perfil (temporales)
  const [tempName, setTempName] = useState("");
  const [tempBio, setTempBio] = useState("");

  // Grabación de audio
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordIntervalRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const recordSecondsRef = useRef(0);

  // Refs para handlers de socket (evitan closures obsoletos)
  const selfIdRef = useRef(selfId);
  const socketRef = useRef<Socket | null>(null);
  const isConnectedRef = useRef(false);
  const replyingToRef = useRef<Message | null>(null);
  const activeChatRef = useRef<string | null>(null);
  const isAtBottomRef = useRef(true);
  const participantsRef = useRef(participants);
  const typingTimerRef = useRef<number | null>(null);
  const typingSentRef = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);
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

  const chatKeyFromScope = (scope: string) => {
    if (scope === LOBBY) return LOBBY;
    const parts = scope.split("|");
    return parts.find((p) => p !== selfIdRef.current) || parts[0];
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
      return { ...prev, [chatKey]: [...list, msg] };
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
        toast.success(`¡${data.profile.name} ahora es tu amigo! 🤝`);
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
      setUnread((u) => ({ ...u, [activeChat]: 0 }));
      setUnreadCount(0);
      setReplyingTo(null);
      setShowStickers(false);
      setMentionSearch(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat, isConnected]);

  // Scroll automático
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: ecoMode ? "auto" : "smooth" });
  }, [activeMessages.length, activeChat, ecoMode]);

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
        setMentionSearch(null);
        setShowStickers(false);
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  useEffect(() => {
    if (showProfile) {
      setTempName(me.name);
      setTempBio(me.bio || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showProfile]);

  // ==========================================
  // ACCIONES DE PERFIL
  // ==========================================
  const updateMe = (patch: Partial<Participant>) => {
    if (!selfId) return;
    setParticipants((prev) => ({ ...prev, [selfId]: { ...(prev[selfId] || me), ...patch, id: selfId } }));
  };

  const onAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await downscaleImage(file, 256);
      updateMe({ avatar: dataUrl });
      toast.success("Foto de perfil actualizada");
    } catch {
      toast.error("No se pudo procesar la imagen");
    }
  };

  const onBannerPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
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
      .then(() => toast.success("Forward Token copiado 📋"))
      .catch(() => toast.error("No se pudo copiar"));
  };

  const submitAddFriend = () => {
    const code = friendCodeInput.trim();
    if (!code) return;
    if (socket && isConnected) {
      socket.emit("add friend", { code });
      setFriendCodeInput("");
    } else {
      toast.error("Sin conexión con el servidor.");
    }
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

  const formatText = (text?: string) => {
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
  };

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

  const sendText = () => {
    const text = draft.trim();
    if (!text) return;
    const replyTo = buildReplyRef(replyingTo);
    if (!emitMessage({ text, replyTo })) {
      appendLocal({ authorId: selfId, kind: "text", text, replyTo });
      toast.warning("Sin conexión: el mensaje solo es visible para ti.");
    }
    setDraft("");
    setMentionSearch(null);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingSentRef.current = false;
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

  const startRecording = async () => {
    cancelledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickRecorderMimeType();
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const duration = Math.max(recordSecondsRef.current, 1);
        recordSecondsRef.current = 0;
        setRecordSeconds(0);
        if (cancelledRef.current) return;
        const realMimeType = rec.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: realMimeType });
        const ext = realMimeType.includes("mp4") ? "m4a" : realMimeType.includes("ogg") ? "ogg" : realMimeType.includes("mpeg") ? "mp3" : "webm";
        const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: realMimeType });
        const localUrl = URL.createObjectURL(blob);
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
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setRecordSeconds(0);
      recordSecondsRef.current = 0;
      recordIntervalRef.current = window.setInterval(
        () =>
          setRecordSeconds((s) => {
            const next = s + 1;
            recordSecondsRef.current = next;
            return next;
          }),
        1000
      );
    } catch {
      cancelledRef.current = true;
      setRecording(false);
      toast.error("No se pudo acceder al micrófono.");
    }
  };

  const stopRecording = (cancel: boolean) => {
    cancelledRef.current = cancel;
    if (recordIntervalRef.current) {
      clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    if (cancel) {
      setRecordSeconds(0);
      recordSecondsRef.current = 0;
    }
  };

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

  const onStickerPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
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
  const typingInActive = activeChat ? Object.entries(typingUsers[activeChat] || {}).filter(([uid]) => uid !== selfId) : [];
  const canSend = draft.trim().length > 0;
  const inChat = activeChat !== null;

  const bannerStyleFor = (p: Participant | null | undefined): React.CSSProperties => {
    if (!p) return { backgroundColor: t.accentHex };
    if (p.bannerColor) return { backgroundColor: p.bannerColor };
    return { backgroundColor: p.color || t.accentHex };
  };

  // ==========================================
  // RENDER
  // ==========================================
  return (
    <MotionConfig reducedMotion={ecoMode ? "always" : "never"}>
    <div className={`size-full min-h-screen ${t.bg} ${t.text} flex items-center justify-center font-mono transition-colors duration-500`}>
      <Toaster position="top-center" expand={false} richColors />
      <div className={`relative w-full max-w-md h-[100dvh] md:h-[90vh] md:rounded-2xl overflow-hidden flex flex-col ${t.border} border ${t.bg}`}>
        {/* ============ HEADER ============ */}
        <motion.header
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 280, damping: 26 }}
          className={`flex items-center gap-3 px-4 py-3 ${t.panel} border-b ${t.border} backdrop-blur-sm z-30 shrink-0`}
        >
          <motion.button
            whileTap={{ scale: 0.9 }}
            whileHover={{ scale: 1.05 }}
            onClick={() => {
              if (showThemes || showProfile || menuOpen || viewProfileId || pendingImage || showFriends || showMembers) {
                closeAllOverlays();
              } else if (inChat) {
                setActiveChat(null);
              } else {
                setMenuOpen(true);
              }
            }}
            className={`p-2 rounded-lg ${t.iconBtn} transition-colors`}
            aria-label={inChat ? "Regresar" : "Abrir menú"}
          >
            {showThemes || showProfile || menuOpen || viewProfileId || pendingImage || showFriends || showMembers || inChat ? (
              <ArrowLeft className="size-5" />
            ) : (
              <Menu className="size-5" />
            )}
          </motion.button>

          {inChat ? (
            <>
              {/* Cabecera del chat activo */}
              <button
                onClick={() => activeChat !== LOBBY && setViewProfileId(activeChat)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                {activeChat === LOBBY ? (
                  <div className={`size-10 rounded-xl ${t.accent} flex items-center justify-center shadow-lg shrink-0`}>
                    <Hash className="size-5 text-white" />
                  </div>
                ) : (
                  <div
                    className="relative size-10 rounded-full flex items-center justify-center text-white shrink-0 overflow-hidden shadow-lg"
                    style={{ backgroundColor: activePeer?.color || t.accentHex }}
                  >
                    {activePeer?.avatar ? (
                      <img src={activePeer.avatar} alt="" className="size-full object-cover" />
                    ) : activePeer?.isBot ? (
                      <Bot className="size-5" />
                    ) : (
                      (activePeer?.name || "?").charAt(0).toUpperCase()
                    )}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="truncate font-display text-sm flex items-center gap-1.5">
                    {activeChat === LOBBY ? "Lobby Público" : activePeer?.name || activeChat}
                    {activePeer?.isBot && <Sparkles className="size-3 text-purple-400" />}
                  </div>
                  <div className={`text-xs ${t.textMuted} truncate`}>
                    {typingInActive.length > 0 ? (
                      <span className={t.accentText}>
                        {typingInActive.map(([, n]) => n).join(", ")} está escribiendo
                        <AnimatedDots />
                      </span>
                    ) : activeChat === LOBBY ? (
                      <span className={t.onlineText}>● {onlineCount} en línea</span>
                    ) : activePeer ? (
                      <span className={STATUSES[activePeer.status].color}>{STATUSES[activePeer.status].label}</span>
                    ) : (
                      ""
                    )}
                  </div>
                </div>
              </button>
              <div className="flex items-center gap-1 shrink-0">
                {activeChat === LOBBY ? (
                  <>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      whileHover={{ scale: 1.05 }}
                      onClick={() => rtc.joinVoice("audio")}
                      disabled={rtc.callState !== "idle"}
                      className={`relative p-2 rounded-lg ${t.iconBtn} ${rtc.callState !== "idle" ? "opacity-40" : ""}`}
                      aria-label="Unirse al canal de voz"
                    >
                      <Phone className="size-4.5" />
                      {rtc.voiceMembers.length > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-4 h-4 px-0.5 rounded-full bg-emerald-500 text-white text-[9px] flex items-center justify-center font-bold">
                          {rtc.voiceMembers.length}
                        </span>
                      )}
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      whileHover={{ scale: 1.05 }}
                      onClick={() => rtc.joinVoice("video")}
                      disabled={rtc.callState !== "idle"}
                      className={`p-2 rounded-lg ${t.iconBtn} ${rtc.callState !== "idle" ? "opacity-40" : ""}`}
                      aria-label="Unirse con video"
                    >
                      <Video className="size-4.5" />
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      whileHover={{ scale: 1.05 }}
                      onClick={() => setShowMembers(true)}
                      className={`p-2 rounded-lg ${t.iconBtn}`}
                      aria-label="Ver miembros"
                    >
                      <Users className="size-4.5" />
                    </motion.button>
                  </>
                ) : (
                  !activePeer?.isBot && (
                    <>
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        whileHover={{ scale: 1.05 }}
                        onClick={() => rtc.startCall(activeChat!, "audio")}
                        disabled={rtc.callState !== "idle"}
                        className={`p-2 rounded-lg ${t.iconBtn} ${rtc.callState !== "idle" ? "opacity-40" : ""}`}
                        aria-label="Llamada de voz"
                      >
                        <Phone className="size-4.5" />
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        whileHover={{ scale: 1.05 }}
                        onClick={() => rtc.startCall(activeChat!, "video")}
                        disabled={rtc.callState !== "idle"}
                        className={`p-2 rounded-lg ${t.iconBtn} ${rtc.callState !== "idle" ? "opacity-40" : ""}`}
                        aria-label="Videollamada"
                      >
                        <Video className="size-4.5" />
                      </motion.button>
                    </>
                  )
                )}
              </div>
            </>
          ) : (
            <>
              {/* Cabecera de inicio */}
              <motion.div
                initial={{ rotate: -180, scale: 0 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
                whileHover={{ rotate: 10, scale: 1.08 }}
                className={`size-10 rounded-xl ${t.accent} flex items-center justify-center shadow-lg`}
              >
                <MessageSquare className="size-5 text-white" />
              </motion.div>

              <div className="flex-1 min-w-0">
                <div className="truncate font-display text-sm">Forward_Chat</div>
                <div className="relative inline-block">
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setStatusOpen((o) => !o)}
                    className={`flex items-center gap-1.5 text-xs font-pixel-ui ${STATUSES[me.status].color} hover:opacity-80`}
                  >
                    <span className={`size-1.5 rounded-full ${STATUSES[me.status].bg} ${me.status === "online" ? "animate-pulse" : ""}`} />
                    {STATUSES[me.status].label.toUpperCase()}
                    <ChevronDown className="size-3" />
                  </motion.button>
                  <AnimatePresence>
                    {statusOpen && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setStatusOpen(false)} />
                        <motion.div
                          initial={{ opacity: 0, y: -6, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -6, scale: 0.95 }}
                          transition={{ type: "spring", stiffness: 400, damping: 22 }}
                          className={`absolute top-full mt-1 left-0 z-40 ${t.panel} border ${t.borderStrong} rounded-lg shadow-2xl py-1 min-w-[180px] backdrop-blur`}
                        >
                          {(["online", "idle", "dnd", "invisible"] as Status[]).map((s) => {
                            const S = STATUSES[s];
                            const Icon = S.icon;
                            const active = me.status === s;
                            return (
                              <motion.button
                                key={s}
                                whileHover={{ x: 3 }}
                                onClick={() => {
                                  updateMe({ status: s });
                                  setStatusOpen(false);
                                }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-white/5 ${active ? t.accentSoft : ""}`}
                              >
                                <Icon className={`size-3.5 ${S.color}`} fill={s === "online" || s === "dnd" ? "currentColor" : "none"} />
                                <span className={S.color}>{S.label}</span>
                                {active && <Check className="size-3.5 ml-auto" />}
                              </motion.button>
                            );
                          })}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowProfile(true)}
                className={`flex items-center gap-2 pl-1 pr-3 py-1 rounded-full ${t.accentSoft} border ${t.border}`}
              >
                <span className={`size-7 rounded-full ${t.accent} flex items-center justify-center text-white text-sm overflow-hidden`}>
                  {me.avatar ? <img src={me.avatar} alt="" className="size-full object-cover" /> : me.name.charAt(0).toUpperCase()}
                </span>
                <span className="text-sm max-w-[90px] truncate">{me.name}</span>
              </motion.button>
            </>
          )}
        </motion.header>

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
          /* -------- PANTALLA DE INICIO: LISTA DE CHATS -------- */
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
                lastOf(LOBBY)
                  ? `${lastOf(LOBBY)!.authorId === selfId ? "Tú" : participants[lastOf(LOBBY)!.authorId]?.name || "Anónimo"}: ${messagePreview(lastOf(LOBBY)!.kind, lastOf(LOBBY)!.text)}`
                  : "Habla con todos los conectados"
              }
              meta={<span className={`text-xs ${t.onlineText}`}>● {onlineCount}</span>}
              unread={unread[LOBBY] || 0}
              onClick={() => setActiveChat(LOBBY)}
            />

            <div className={`px-4 pt-5 pb-2 flex items-center justify-between`}>
              <span className={`text-[10px] font-pixel-ui tracking-widest ${t.textMuted}`}>MENSAJES PRIVADOS</span>
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => setShowFriends(true)}
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
                    last
                      ? `${last.authorId === selfId ? "Tú: " : ""}${messagePreview(last.kind, last.text)}`
                      : isBotChat
                        ? "Tu asistente personal de IA"
                        : p?.bio || "Inicia la conversación"
                  }
                  meta={last ? <span className={`text-[10px] ${t.textMuted}`}>{last.time}</span> : null}
                  unread={unread[peerId] || 0}
                  onClick={() => setActiveChat(peerId)}
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
                  onClick={() => setShowFriends(true)}
                  className={`px-4 py-2.5 rounded-xl ${t.accent} ${t.accentHover} text-white text-sm shadow-lg inline-flex items-center gap-2`}
                >
                  <UserPlus className="size-4" />
                  Agregar amigo
                </motion.button>
              </motion.div>
            )}
            <div className="h-4" />
          </div>
        ) : (
          /* -------- VISTA DE CHAT -------- */
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
              {activeMessages.length === 0 ? (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 0.7, y: 0 }} className="h-full flex flex-col items-center justify-center text-center px-6">
                  <div className={`size-16 rounded-2xl ${t.iconBtn} flex items-center justify-center mb-4`}>
                    {activeChat === LOBBY ? <MessagesSquare className={`size-8 ${t.accentText}`} /> : <KeyRound className={`size-8 ${t.accentText}`} />}
                  </div>
                  <div className="mb-1">{activeChat === LOBBY ? "No hay mensajes aún" : "Conversación privada"}</div>
                  <div className={`text-sm ${t.textMuted}`}>
                    {activeChat === LOBBY
                      ? "¡Envía el primer mensaje, una foto o un audio!"
                      : activePeer?.isBot
                        ? "Pregúntame lo que quieras, papu. También genero imágenes: \"dibuja un gato astronauta\" 🎨"
                        : "Solo tú y esta persona pueden ver estos mensajes."}
                  </div>
                </motion.div>
              ) : (
                <AnimatePresence initial={false}>
                  {activeMessages.map((m, idx) => {
                    const author: Participant = participants[m.authorId] || {
                      id: m.authorId,
                      name: m.authorId || "Anónimo",
                      color: colorForUser(m.authorId || "x"),
                      status: "offline",
                    };
                    const isMine = m.authorId === selfId;
                    const prev = activeMessages[idx - 1];
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
                        onTogglePicker={() => setOpenMenuFor((cur) => (cur === m.id ? null : m.id))}
                        onClosePicker={() => setOpenMenuFor(null)}
                        onDelete={() => deleteMessage(m.id)}
                        onReact={(rid) => toggleReaction(m.id, rid)}
                        onReply={() => setReplyingTo(m)}
                        onAvatarClick={() => setViewProfileId(author.id)}
                        onSaveSticker={saveSticker}
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
                  onClick={() => {
                    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
                    setUnreadCount(0);
                  }}
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

            {/* ============ COMPOSER ============ */}
            <div className={`${t.panel} border-t ${t.border} shrink-0`}>
              <AnimatePresence>
                {replyingTo && (
                  <motion.div
                    initial={{ y: 8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 8, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 380, damping: 24 }}
                    className={`mx-3 mt-2 rounded-xl border ${t.border} ${t.inputBg} px-3 py-2 flex items-start gap-2`}
                  >
                    <Reply className={`size-4 mt-0.5 shrink-0 ${t.accentText}`} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-[10px] font-pixel-ui tracking-widest ${t.accentText}`}>
                        RESPONDIENDO A {(replyingTo.authorId === selfId ? "TI" : (participants[replyingTo.authorId]?.name || "anónimo").toUpperCase())}
                      </div>
                      <div className={`text-xs truncate ${t.textMuted}`}>{messagePreview(replyingTo.kind, replyingTo.text)}</div>
                    </div>
                    <CloseButton onClick={() => setReplyingTo(null)} className={`${t.iconBtn} border shadow-sm`} size="small" />
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {showStickers && (
                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 20, opacity: 0 }}
                    className={`mx-3 mt-2 ${t.panel} border ${t.borderStrong} rounded-2xl shadow-2xl p-3 z-20`}
                  >
                    <div className="flex items-center justify-between mb-3 px-1">
                      <div className="flex items-center gap-2">
                        <Sticker className={`size-4 ${t.accentText}`} />
                        <span className="text-xs font-pixel-ui tracking-widest">STICKERS</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input ref={stickerInputRef} type="file" accept="image/*" className="hidden" onChange={onStickerPick} />
                        <button
                          onClick={() => stickerInputRef.current?.click()}
                          className={`p-1.5 rounded-lg ${t.iconBtn}`}
                          title="Subir sticker personalizado"
                        >
                          <Sparkles className="size-3.5" />
                        </button>
                        <CloseButton onClick={() => setShowStickers(false)} className={t.iconBtn} size="small" />
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
                      {favoriteStickers.length > 0 && (
                        <div className="col-span-4 mb-1">
                          <div className={`text-[10px] ${t.textMuted} tracking-widest mb-2 flex items-center gap-1`}>
                            <Star className="size-3" /> FAVORITOS
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            {favoriteStickers.map((s, i) => (
                              <motion.button
                                key={`fav-${i}`}
                                whileHover={{ scale: 1.1, rotate: 5 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => sendSticker(s)}
                                className="aspect-square rounded-lg overflow-hidden bg-black/5 flex items-center justify-center p-1"
                              >
                                <img src={s} alt="" className="size-full object-contain" />
                              </motion.button>
                            ))}
                          </div>
                          <div className={`my-3 border-t ${t.border} opacity-50`} />
                        </div>
                      )}

                      {stickers.map((s, i) => (
                        <div key={i} className="relative group/stick aspect-square">
                          <motion.button
                            whileHover={{ scale: 1.08, rotate: -5 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => sendSticker(s)}
                            className="size-full rounded-lg overflow-hidden bg-black/5 flex items-center justify-center p-1"
                          >
                            <img src={s} alt="" className="size-full object-contain" />
                          </motion.button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavoriteSticker(s);
                            }}
                            className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/40 opacity-0 group-hover/stick:opacity-100 transition-opacity"
                            title={favoriteStickers.includes(s) ? "Quitar de favoritos" : "Agregar a favoritos"}
                          >
                            <Star className={`size-3 ${favoriteStickers.includes(s) ? "text-yellow-400 fill-yellow-400" : "text-white"}`} />
                          </button>
                        </div>
                      ))}
                      {stickers.length === 0 && (
                        <div className={`col-span-4 py-8 text-center text-xs ${t.textMuted}`}>
                          No tienes stickers aún. <br /> ¡Sube uno con el botón ✨!
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence mode="wait">
                {recording ? (
                  <motion.div
                    key="recorder"
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 20, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 350, damping: 26 }}
                    className="flex items-center gap-3 p-3"
                  >
                    <motion.button
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => stopRecording(true)}
                      className={`p-3 rounded-xl ${t.danger} text-white shadow-lg`}
                      aria-label="Cancelar grabación"
                    >
                      <Trash2 className="size-5" />
                    </motion.button>

                    <div className={`flex-1 flex items-center gap-3 ${t.inputBg} border ${t.border} rounded-xl px-4 py-2.5`}>
                      <motion.span
                        animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
                        transition={{ duration: 1, repeat: Infinity }}
                        className="size-2.5 rounded-full bg-red-500"
                      />
                      <span className="tabular-nums text-sm">{fmtTime(recordSeconds)}</span>
                      <div className="flex-1 flex items-center justify-center gap-0.5 h-6">
                        {Array.from({ length: 22 }).map((_, i) => (
                          <motion.span
                            key={i}
                            animate={{ scaleY: [0.3, 1, 0.3] }}
                            transition={{
                              duration: 0.6 + (i % 5) * 0.15,
                              repeat: Infinity,
                              delay: (i % 7) * 0.05,
                              ease: "easeInOut",
                            }}
                            className="w-0.5 h-full rounded-full"
                            style={{ backgroundColor: t.accentHex }}
                          />
                        ))}
                      </div>
                    </div>

                    <motion.button
                      whileHover={{ scale: 1.08, rotate: -8 }}
                      whileTap={{ scale: 0.85 }}
                      onClick={() => stopRecording(false)}
                      className={`p-3 rounded-xl ${t.accent} ${t.accentHover} text-white shadow-lg`}
                      aria-label="Enviar audio"
                    >
                      <Send className="size-5" />
                    </motion.button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="composer"
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 10, opacity: 0 }}
                    className="flex items-center gap-2 p-3"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) queueImage(f);
                        e.target.value = "";
                      }}
                    />

                    <motion.button
                      whileHover={{ y: -2, rotate: -8 }}
                      whileTap={{ scale: 0.85, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 16 }}
                      onClick={() => fileInputRef.current?.click()}
                      className={`p-2.5 rounded-xl ${t.iconBtn}`}
                      aria-label="Adjuntar imagen"
                    >
                      <ImageIcon className="size-5" />
                    </motion.button>
                    <motion.button
                      whileHover={{ y: -2, scale: 1.05 }}
                      whileTap={{ scale: 0.85 }}
                      transition={{ type: "spring", stiffness: 400, damping: 16 }}
                      onClick={() => setShowStickers(!showStickers)}
                      className={`p-2.5 rounded-xl ${showStickers ? `${t.accent} text-white` : t.iconBtn}`}
                      aria-label="Stickers"
                    >
                      <Sticker className="size-5" />
                    </motion.button>
                    <motion.button
                      whileHover={{ y: -2, scale: 1.05 }}
                      whileTap={{ scale: 0.85 }}
                      transition={{ type: "spring", stiffness: 400, damping: 16 }}
                      onClick={startRecording}
                      className={`p-2.5 rounded-xl ${t.iconBtn}`}
                      aria-label="Grabar audio"
                    >
                      <Mic className="size-5" />
                    </motion.button>
                    <div className="flex-1 relative">
                      <AnimatePresence>
                        {mentionSearch !== null && filteredMentions.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className={`absolute bottom-full left-0 mb-2 w-48 ${t.panel} border ${t.borderStrong} rounded-xl shadow-2xl overflow-hidden z-50`}
                          >
                            <div className={`px-3 py-2 text-[10px] font-pixel-ui tracking-widest ${t.textMuted} border-b ${t.border}`}>MENCIONAR A...</div>
                            {filteredMentions.map((p, i) => (
                              <button
                                key={p.id}
                                onClick={() => insertMention(p)}
                                onMouseEnter={() => setMentionIndex(i)}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                                  i === mentionIndex ? t.accentSoft : ""
                                }`}
                              >
                                <span className="size-6 rounded-full flex items-center justify-center text-white text-[10px] overflow-hidden" style={{ backgroundColor: p.color }}>
                                  {p.avatar ? <img src={p.avatar} alt="" className="size-full object-cover" /> : p.name.charAt(0).toUpperCase()}
                                </span>
                                <span className={i === mentionIndex ? t.accentText : t.text}>{p.name}</span>
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <input
                        value={draft}
                        onChange={(e) => onDraftChange(e.target.value)}
                        onKeyDown={onDraftKeyDown}
                        placeholder={activeChat === LOBBY ? "Escribe un mensaje..." : `Mensaje para ${activePeer?.name || "..."}`}
                        className={`w-full ${t.inputBg} border ${t.border} rounded-xl px-4 py-2.5 outline-none placeholder:opacity-50 min-w-0 ${t.text}`}
                      />
                    </div>
                    <motion.button
                      whileHover={canSend ? { scale: 1.1 } : {}}
                      whileTap={canSend ? { scale: 0.85, rotate: -25 } : { scale: 0.95 }}
                      animate={
                        canSend
                          ? { scale: [1, 1.05, 1], boxShadow: [`0 0 0 0 ${t.accentHex}55`, `0 0 0 8px ${t.accentHex}00`, `0 0 0 0 ${t.accentHex}00`] }
                          : { rotate: -10, opacity: 0.5 }
                      }
                      transition={
                        canSend
                          ? { duration: 1.6, repeat: Infinity, ease: "easeOut" }
                          : { type: "spring", stiffness: 400, damping: 18 }
                      }
                      onClick={sendText}
                      disabled={!canSend}
                      style={canSend ? { background: `linear-gradient(135deg, ${t.accentHex}, ${t.accentHex}cc)` } : undefined}
                      className={`shrink-0 size-11 rounded-full flex items-center justify-center text-white shadow-lg ${
                        canSend ? "" : `${t.iconBtn} cursor-not-allowed`
                      }`}
                      aria-label="Enviar"
                    >
                      <Send className={`size-5 ${canSend ? "text-white -translate-x-px" : t.accentText}`} fill={canSend ? "currentColor" : "none"} />
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}

        {/* ============ MENÚ LATERAL ============ */}
        <AnimatePresence>
          {menuOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 bg-black/30 z-40 backdrop-blur-sm"
                onClick={closeAllOverlays}
              />
              <motion.aside
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", stiffness: 320, damping: 32 }}
                className={`absolute top-0 left-0 h-full w-[85%] max-w-xs ${t.bg} border-r ${t.border} z-50 flex flex-col shadow-2xl`}
              >
                <div className={`relative shrink-0 overflow-hidden border-b ${t.border}`}>
                  {/* Banner de fondo: cubre todo el encabezado hasta la línea */}
                  <div className="absolute inset-0" style={me.banner ? undefined : bannerStyleFor(me)}>
                    {me.banner && <img src={me.banner} alt="" className="size-full object-cover" />}
                  </div>
                  {/* Velo para legibilidad del texto sobre el banner */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
                  <div className="absolute top-2.5 right-2.5 z-10">
                    <CloseButton onClick={closeAllOverlays} className="bg-black/40 hover:bg-black/60 text-white shadow-md" size="small" />
                  </div>
                  {/* Contenido: avatar y datos centrados, sin recortes */}
                  <button
                    onClick={() => { setMenuOpen(false); setShowProfile(true); }}
                    className="relative w-full flex items-center gap-3 px-4 pt-5 pb-3 text-left"
                    aria-label="Editar perfil"
                  >
                    <div
                      className="size-14 rounded-full flex items-center justify-center text-white text-xl overflow-hidden border-[3px] shadow-xl shrink-0"
                      style={{ backgroundColor: me.color, borderColor: "rgba(255,255,255,0.9)" }}
                    >
                      {me.avatar ? <img src={me.avatar} alt="" className="size-full object-cover" /> : me.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-display text-sm flex items-center gap-1.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                        <span className="truncate">{me.name}</span>
                        <Pencil className="size-3 shrink-0 text-white/80" />
                      </div>
                      <div className={`flex items-center gap-1.5 text-xs mt-0.5 ${STATUSES[me.status].color} drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]`}>
                        <span className={`size-1.5 rounded-full ${STATUSES[me.status].bg}`} />
                        {STATUSES[me.status].label}
                      </div>
                    </div>
                  </button>
                </div>

                <motion.nav
                  className="flex-1 p-3 space-y-1 overflow-y-auto"
                  initial="hidden"
                  animate="show"
                  variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.15 } } }}
                >
                  <MenuItem icon={<User className="size-5" />} label="Editar perfil" onClick={() => { setMenuOpen(false); setShowProfile(true); }} mutedColor={t.textMuted} />
                  <MenuItem icon={<UserPlus className="size-5" />} label="Amigos y Forward Token" onClick={() => { setMenuOpen(false); setShowFriends(true); }} mutedColor={t.textMuted} />
                  <MenuItem icon={<Palette className="size-5" />} label="Temas" onClick={() => { setMenuOpen(false); setShowThemes(true); }} mutedColor={t.textMuted} />

                  <div className={`px-3 pt-3 pb-1 text-[10px] font-pixel-ui tracking-widest ${t.textMuted}`}>PERMISOS DE LLAMADAS</div>
                  <PermissionRow
                    icon={<Mic className="size-5" />}
                    label="Micrófono"
                    enabled={perms.mic}
                    theme={t}
                    onToggle={() => {
                      setPerms((p) => {
                        const next = { ...p, mic: !p.mic };
                        toast.info(next.mic ? "Micrófono habilitado para llamadas 🎙️" : "Micrófono deshabilitado: no podrás llamar ni contestar.");
                        return next;
                      });
                    }}
                  />
                  <PermissionRow
                    icon={<Video className="size-5" />}
                    label="Cámara"
                    enabled={perms.cam}
                    theme={t}
                    onToggle={() => {
                      setPerms((p) => {
                        const next = { ...p, cam: !p.cam };
                        toast.info(next.cam ? "Cámara habilitada para videollamadas 🎥" : "Cámara deshabilitada: las videollamadas quedan bloqueadas.");
                        return next;
                      });
                    }}
                  />

                  <MenuItem
                    icon={<Leaf className={`size-5 ${ecoMode ? "text-emerald-400" : ""}`} />}
                    label={`Modo Eco: ${ecoMode ? "Activado 🌱" : "Desactivado"}`}
                    onClick={() => {
                      setEcoMode((v) => !v);
                      toast.success(ecoMode ? "Modo Eco desactivado" : "Modo Eco 🌱: menos animaciones, menos batería");
                    }}
                    mutedColor={t.textMuted}
                  />
                  <MenuItem
                    icon={<Trash2 className="size-5" />}
                    label="Limpiar chat local"
                    onClick={() => {
                      setChats((prev) => ({ ...prev, [activeChatRef.current || LOBBY]: [] }));
                      toast.info("Chat limpiado localmente (solo en tu pantalla).");
                    }}
                    mutedColor={t.textMuted}
                  />
                </motion.nav>

                <div className={`p-3 border-t ${t.border}`}>
                  {friendCode && (
                    <button
                      onClick={copyFriendCode}
                      className={`w-full mb-2 flex items-center justify-center gap-2 px-3 py-2 rounded-lg ${t.inputBg} border ${t.border} text-xs hover:opacity-80`}
                      title="Copiar mi Forward Token"
                    >
                      <KeyRound className={`size-3.5 ${t.accentText}`} />
                      <span className="font-pixel-ui tracking-wider">{friendCode}</span>
                      <Copy className="size-3 opacity-60" />
                    </button>
                  )}
                  <div className={`text-[10px] ${t.textMuted} tracking-widest text-center font-pixel-ui`}>
                    FORWARD_CHAT v3.0 {ecoMode && "🌱"}
                  </div>
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* ============ MODAL DE TEMAS ============ */}
        <AnimatePresence>
          {showThemes && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-40 flex items-start md:items-center justify-center p-3 pt-20 md:p-3 bg-black/70 backdrop-blur-sm"
              onClick={() => setShowThemes(false)}
            >
              <motion.div
                initial={{ y: -60, opacity: 0, scale: 0.95 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: -60, opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
                onClick={(e) => e.stopPropagation()}
                className={`w-full max-w-md ${t.panel} border ${t.borderStrong} rounded-2xl p-5 shadow-2xl max-h-[85dvh] overflow-y-auto`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Palette className={`size-5 ${t.accentText}`} />
                    <span>Temas</span>
                  </div>
                  <CloseButton onClick={() => setShowThemes(false)} className={`${t.iconBtn} border shadow-sm`} size="small" />
                </div>

                <div className={`text-xs ${t.textMuted} tracking-widest mb-2`}>MODO</div>
                <div className={`grid grid-cols-2 gap-2 p-1 rounded-xl ${t.inputBg} border ${t.border} mb-5`}>
                  {[
                    { key: "light" as Theme, icon: <Sun className="size-4" />, label: "Claro" },
                    { key: "dark" as Theme, icon: <Moon className="size-4" />, label: "Oscuro" },
                  ].map((m) => {
                    const selected = theme === m.key;
                    return (
                      <motion.button
                        key={m.key}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => setTheme(m.key)}
                        className={`relative flex items-center justify-center gap-2 py-2.5 rounded-lg transition-colors ${
                          selected ? `${t.accent} text-white shadow-md` : `${t.text} hover:bg-white/5`
                        }`}
                      >
                        {m.icon}
                        <span className="text-sm">{m.label}</span>
                      </motion.button>
                    );
                  })}
                </div>

                <div className={`text-xs ${t.textMuted} tracking-widest mb-2 font-pixel-ui`}>
                  TEMAS {t.isLight ? "CLAROS" : "OSCUROS"}
                </div>
                <motion.div
                  key={t.isLight ? "light-grid" : "dark-grid"}
                  className="grid grid-cols-2 gap-3"
                  initial="hidden"
                  animate="show"
                  variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } } }}
                >
                  {(t.isLight
                    ? (["candy", "redWhite"] as Theme[])
                    : (["monokai", "solarized", "dracula", "oneDark", "redDark"] as Theme[])
                  ).map((key) => {
                    const opt = themes[key];
                    const selected = key === theme;
                    return (
                      <motion.button
                        key={key}
                        variants={{
                          hidden: { opacity: 0, y: 16, scale: 0.9 },
                          show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 300, damping: 22 } },
                        }}
                        whileHover={{ y: -3, scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setTheme(key)}
                        className={`relative p-3 rounded-xl border-2 transition-colors text-left ${
                          selected ? opt.borderStrong : t.border
                        } ${t.inputBg}`}
                      >
                        <div className={`relative h-20 rounded-lg overflow-hidden ${opt.preview.bg} p-2 flex flex-col justify-between mb-2`}>
                          <div className="flex items-center gap-1">
                            <div className={`size-2.5 rounded-full ${opt.preview.bubbleA}`} />
                            <div className={`h-2 w-10 rounded-full ${opt.preview.bubbleB}`} />
                          </div>
                          <div className="flex flex-col gap-1 items-end">
                            <div className={`h-2 w-14 rounded-full ${opt.preview.bubbleC}`} />
                            <div className={`h-2 w-8 rounded-full ${opt.preview.bubbleA}`} />
                          </div>
                          {selected && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: "spring", stiffness: 400, damping: 18 }}
                              className={`absolute top-1.5 right-1.5 size-6 rounded-full ${opt.accent} flex items-center justify-center shadow-md`}
                            >
                              <Check className="size-3.5 text-white" strokeWidth={3} />
                            </motion.div>
                          )}
                        </div>
                        <div className="text-sm">{opt.name}</div>
                      </motion.button>
                    );
                  })}
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ============ PREVIEW DE IMAGEN ============ */}
        <AnimatePresence>
          {pendingImage && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm"
            >
              <div className="flex items-center justify-between px-4 py-3 text-white">
                <CloseButton
                  onClick={() => {
                    URL.revokeObjectURL(pendingImage.previewUrl);
                    setPendingImage(null);
                  }}
                  className="bg-white/10 hover:bg-white/20 text-white"
                />
                <span className="font-pixel-ui text-xs tracking-widest opacity-80">VISTA PREVIA</span>
                <div className="size-9" />
              </div>

              <div className="flex-1 flex items-center justify-center px-4 overflow-hidden">
                <motion.img
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 280, damping: 24 }}
                  src={pendingImage.previewUrl}
                  alt="preview"
                  className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
                />
              </div>

              <motion.div
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 26, delay: 0.1 }}
                className="p-3 flex items-center gap-2"
              >
                <input
                  autoFocus
                  value={pendingImage.caption}
                  onChange={(e) => setPendingImage((p) => (p ? { ...p, caption: e.target.value } : p))}
                  onKeyDown={(e) => e.key === "Enter" && confirmSendImage()}
                  placeholder="Añade un comentario..."
                  className="flex-1 bg-white/10 text-white placeholder-white/50 border border-white/20 rounded-full px-4 py-3 outline-none min-w-0"
                />
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.85, rotate: -25 }}
                  onClick={confirmSendImage}
                  style={{ background: `linear-gradient(135deg, ${t.accentHex}, ${t.accentHex}cc)` }}
                  className="shrink-0 size-12 rounded-full flex items-center justify-center text-white shadow-lg"
                  aria-label="Enviar imagen"
                >
                  <Send className="size-5 -translate-x-px" fill="currentColor" />
                </motion.button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ============ MODAL: MIEMBROS EN LÍNEA ============ */}
        <AnimatePresence>
          {showMembers && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
              onClick={() => setShowMembers(false)}
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
                  <CloseButton onClick={() => setShowMembers(false)} className={`${t.iconBtn} border shadow-sm`} size="small" />
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
                          setShowMembers(false);
                          setViewProfileId(id);
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

        {/* ============ MODAL: AMIGOS Y FRIEND TOKEN ============ */}
        <AnimatePresence>
          {showFriends && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
              onClick={() => setShowFriends(false)}
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
                  <CloseButton onClick={() => setShowFriends(false)} className={`${t.iconBtn} border shadow-sm`} size="small" />
                </div>

                {/* Mi token */}
                <div className={`text-[10px] font-pixel-ui tracking-widest ${t.textMuted} mb-1.5`}>TU FORWARD TOKEN</div>
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={copyFriendCode}
                  className={`w-full mb-1 flex items-center justify-between gap-2 px-4 py-3 rounded-xl border-2 ${t.borderStrong} ${t.inputBg}`}
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
                    value={friendCodeInput}
                    onChange={(e) => setFriendCodeInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && submitAddFriend()}
                    placeholder="FWD-XXXX-XXXX"
                    className={`flex-1 ${t.inputBg} border ${t.border} rounded-xl px-4 py-2.5 outline-none placeholder:opacity-40 min-w-0 ${t.text} font-pixel-ui tracking-widest text-sm uppercase`}
                  />
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={submitAddFriend}
                    disabled={!friendCodeInput.trim()}
                    className={`px-4 rounded-xl ${friendCodeInput.trim() ? `${t.accent} ${t.accentHover} text-white` : `${t.iconBtn} opacity-50`} shadow-lg`}
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
                    Aún no tienes amigos agregados.<br />¡Intercambia tokens para empezar! 🤝
                  </div>
                ) : (
                  <div className="space-y-1">
                    {friends.map((fid) => {
                      const p = participants[fid];
                      if (!p) return null;
                      return (
                        <div key={fid} className={`flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5`}>
                          <button onClick={() => { setShowFriends(false); setViewProfileId(fid); }} className="relative size-9 rounded-full flex items-center justify-center text-white text-sm overflow-hidden shrink-0" style={{ backgroundColor: p.color }}>
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
                              setShowFriends(false);
                              setActiveChat(fid);
                            }}
                            className={`p-2 rounded-lg ${t.accentSoft} ${t.accentText}`}
                            title="Enviar mensaje"
                          >
                            <MessageSquare className="size-4" />
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => {
                              socket?.emit("remove friend", { userId: fid });
                              toast.info(`${p.name} eliminado de tus amigos.`);
                            }}
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

        {/* ============ MODAL: VER PERFIL ============ */}
        <AnimatePresence>
          {viewProfileId && participants[viewProfileId] && (() => {
            const p = participants[viewProfileId]!;
            const S = STATUSES[p.status];
            const isSelfProfile = p.id === selfId;
            const isFriend = friends.includes(p.id);
            return (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
                onClick={() => setViewProfileId(null)}
              >
                <motion.div
                  initial={{ scale: 0.85, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.85, opacity: 0, y: 20 }}
                  transition={{ type: "spring", stiffness: 320, damping: 26 }}
                  onClick={(e) => e.stopPropagation()}
                  className={`w-full max-w-xs ${t.panel} rounded-2xl shadow-2xl overflow-hidden border ${t.border}`}
                >
                  {/* Banner del perfil */}
                  <div className="relative h-24 overflow-hidden" style={bannerStyleFor(p)}>
                    {p.banner && <img src={p.banner} alt="" className="size-full object-cover" />}
                  </div>
                  <div className="px-5 pb-5 -mt-10">
                    <div className="flex items-end justify-between mb-3">
                      <div className="relative">
                        <div
                          className="size-20 rounded-full flex items-center justify-center text-white text-3xl overflow-hidden shadow-xl border-4"
                          style={{ backgroundColor: p.color, borderColor: t.accentHex }}
                        >
                          {p.avatar ? <img src={p.avatar} alt="" className="size-full object-cover" /> : p.isBot ? <Bot className="size-8" /> : p.name.charAt(0).toUpperCase()}
                        </div>
                        <span className={`absolute -bottom-0.5 -right-0.5 size-5 rounded-full ${S.bg} border-2`} style={{ borderColor: t.accentHex }} />
                      </div>
                      <CloseButton onClick={() => setViewProfileId(null)} className={`${t.iconBtn} border shadow-sm`} size="small" />
                    </div>
                    <div className="font-display text-base flex items-center gap-1.5">
                      {p.name}
                      {p.isBot && <Sparkles className="size-3.5 text-purple-400" />}
                    </div>
                    <div className={`text-xs font-pixel-ui flex items-center gap-1.5 mt-1 ${S.color}`}>
                      <S.icon className="size-3" fill={p.status === "online" || p.status === "dnd" ? "currentColor" : "none"} />
                      {S.label}
                    </div>

                    {p.bio && (
                      <>
                        <div className={`mt-3 text-[10px] font-pixel-ui tracking-widest ${t.textMuted}`}>SOBRE MÍ</div>
                        <div className={`text-sm ${t.text} whitespace-pre-wrap break-words`}>{p.bio}</div>
                      </>
                    )}

                    <div className={`mt-3 text-[10px] font-pixel-ui tracking-widest ${t.textMuted}`}>ID DE USUARIO</div>
                    <div className={`text-sm ${t.text} flex items-center gap-1`}><AtSign className="size-3.5 opacity-60" />{p.id}</div>

                    {isSelfProfile ? (
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => {
                          setViewProfileId(null);
                          setShowProfile(true);
                        }}
                        className={`mt-4 w-full py-2.5 rounded-xl ${t.accent} ${t.accentHover} text-white flex items-center justify-center gap-2 shadow-lg`}
                      >
                        <Pencil className="size-4" />
                        <span className="text-sm">Editar perfil</span>
                      </motion.button>
                    ) : isFriend || p.isBot ? (
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => {
                          setViewProfileId(null);
                          setActiveChat(p.id);
                        }}
                        className={`mt-4 w-full py-2.5 rounded-xl ${t.accent} ${t.accentHover} text-white flex items-center justify-center gap-2 shadow-lg`}
                      >
                        <MessageSquare className="size-4" />
                        <span className="text-sm">Enviar mensaje</span>
                      </motion.button>
                    ) : (
                      <div className={`mt-4 rounded-xl ${t.inputBg} border ${t.border} p-3 text-[11px] ${t.textMuted} flex items-start gap-2`}>
                        <KeyRound className={`size-4 shrink-0 ${t.accentText}`} />
                        <span>Para chatear en privado con {p.name}, pídele su <b>Forward Token</b> y agrégalo desde el menú de Amigos.</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* ============ MODAL: EDITAR PERFIL ============ */}
        <AnimatePresence>
          {showProfile && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
              onClick={() => setShowProfile(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                transition={{ type: "spring", stiffness: 320, damping: 26 }}
                onClick={(e) => e.stopPropagation()}
                className={`w-full max-w-sm ${t.panel} border ${t.borderStrong} rounded-2xl shadow-2xl max-h-[90dvh] overflow-y-auto overflow-x-hidden`}
              >
                {/* ---- Editor de banner ---- */}
                <div className="relative h-28 group" style={bannerStyleFor(me)}>
                  {me.banner && <img src={me.banner} alt="" className="size-full object-cover" />}
                  <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={onBannerPick} />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => bannerInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur text-white text-xs flex items-center gap-1.5 shadow-lg"
                    >
                      <Camera className="size-3.5" />
                      Foto
                    </motion.button>
                    {(me.banner || me.bannerColor) && (
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => updateMe({ banner: null, bannerColor: null })}
                        className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur text-white text-xs flex items-center gap-1.5 shadow-lg"
                      >
                        <X className="size-3.5" />
                        Quitar
                      </motion.button>
                    )}
                  </div>
                  <div className="absolute top-3 right-3">
                    <CloseButton onClick={() => setShowProfile(false)} className="bg-black/40 hover:bg-black/60 text-white shadow-md" size="small" />
                  </div>
                </div>

                <div className="px-6 pb-6">
                  {/* Avatar sobre el banner */}
                  <div className="flex items-end justify-between -mt-10 mb-3">
                    <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={onAvatarPick} />
                    <motion.button
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => avatarInputRef.current?.click()}
                      className="relative group/avatar"
                    >
                      <div
                        className="size-20 rounded-full flex items-center justify-center text-white text-3xl overflow-hidden border-4 shadow-xl"
                        style={{ backgroundColor: me.color, borderColor: t.accentHex }}
                      >
                        {me.avatar ? <img src={me.avatar} alt="avatar" className="size-full object-cover" /> : me.name.charAt(0).toUpperCase()}
                      </div>
                      <div className={`absolute -bottom-1 -right-1 size-8 rounded-full ${t.accent} flex items-center justify-center shadow-lg border-2 border-black/20`}>
                        <Camera className="size-3.5 text-white" />
                      </div>
                    </motion.button>
                    <div className="flex items-center gap-2 pb-1">
                      <Pencil className={`size-4 ${t.accentText}`} />
                      <span className="text-sm">Editar Perfil</span>
                    </div>
                  </div>

                  {/* ---- Color del banner ---- */}
                  <label className={`text-xs ${t.textMuted} flex items-center gap-1 mb-1.5`}>
                    <Palette className="size-3" /> COLOR DEL BANNER
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5 mb-4">
                    {BANNER_COLORS.map((c) => {
                      const active = !me.banner && me.bannerColor?.toLowerCase() === c.toLowerCase();
                      return (
                        <motion.button
                          key={c}
                          whileHover={{ scale: 1.2, y: -2 }}
                          whileTap={{ scale: 0.85 }}
                          onClick={() => updateMe({ bannerColor: c, banner: null })}
                          className={`size-7 rounded-lg shadow-md ${active ? "ring-2 ring-offset-1 ring-offset-transparent" : ""}`}
                          style={{ backgroundColor: c, boxShadow: active ? `0 0 0 2px ${c}` : undefined }}
                          aria-label={`Color de banner ${c}`}
                        >
                          {active && <Check className="size-4 text-white mx-auto" strokeWidth={3} />}
                        </motion.button>
                      );
                    })}
                    <label
                      className="relative size-7 rounded-lg shadow-md cursor-pointer overflow-hidden flex items-center justify-center ring-1 ring-black/10"
                      title="Elegir un color personalizado"
                      style={{ background: "conic-gradient(from 180deg, #ef4444, #f59e0b, #84cc16, #22d3ee, #3b82f6, #a855f7, #ef4444)" }}
                    >
                      <Pipette className="size-3.5 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]" />
                      <input
                        type="color"
                        value={me.bannerColor || me.color || "#7c5cff"}
                        onChange={(e) => updateMe({ bannerColor: e.target.value, banner: null })}
                        className="absolute inset-0 size-full opacity-0 cursor-pointer"
                      />
                    </label>
                  </div>

                  {/* ---- Nombre ---- */}
                  <label className={`text-xs ${t.textMuted} flex items-center gap-1 mb-1.5`}>
                    <User className="size-3" /> NOMBRE
                  </label>
                  <div className="relative mb-4">
                    <input
                      value={tempName}
                      onChange={(e) => setTempName(e.target.value.slice(0, 30))}
                      placeholder="Tu nombre"
                      className={`w-full ${t.inputBg} border ${t.border} rounded-xl px-4 py-3 pr-10 outline-none ${t.text} focus:border-current transition-colors`}
                    />
                    <Pencil className={`absolute right-3 top-1/2 -translate-y-1/2 size-4 ${t.textMuted}`} />
                  </div>

                  {/* ---- Bio ---- */}
                  <label className={`text-xs ${t.textMuted} flex items-center gap-1 mb-1.5`}>
                    <Sparkles className="size-3" /> SOBRE MÍ
                  </label>
                  <div className="relative mb-1">
                    <textarea
                      value={tempBio}
                      onChange={(e) => setTempBio(e.target.value.slice(0, 200))}
                      placeholder="Cuéntale al mundo quién eres..."
                      rows={2}
                      className={`w-full ${t.inputBg} border ${t.border} rounded-xl px-4 py-3 outline-none ${t.text} resize-none focus:border-current transition-colors`}
                    />
                  </div>
                  <div className={`text-[10px] ${t.textMuted} text-right mb-3`}>{tempBio.length}/200</div>

                  {/* ---- Estado ---- */}
                  <label className={`text-xs ${t.textMuted} flex items-center gap-1 mb-1.5`}>
                    <Sparkles className="size-3" /> ESTADO
                  </label>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {(["online", "idle", "dnd", "invisible"] as Status[]).map((s) => {
                      const S = STATUSES[s];
                      const Icon = S.icon;
                      const active = me.status === s;
                      return (
                        <motion.button
                          key={s}
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.96 }}
                          onClick={() => updateMe({ status: s })}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-colors ${
                            active ? `${t.borderStrong} ${t.accentSoft}` : `${t.border} ${t.inputBg}`
                          }`}
                        >
                          <Icon className={`size-4 ${S.color}`} fill={s === "online" || s === "dnd" ? "currentColor" : "none"} />
                          <span className="text-sm">{S.label}</span>
                          {active && <Check className={`size-3.5 ml-auto ${t.accentText}`} />}
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* ---- Color de usuario ---- */}
                  <label className={`text-xs ${t.textMuted} flex items-center gap-1 mb-1.5`}>
                    <Palette className="size-3" /> TU COLOR
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {USER_COLORS.map((c) => {
                      const active = me.color.toLowerCase() === c.toLowerCase();
                      return (
                        <motion.button
                          key={c}
                          whileHover={{ scale: 1.2, y: -2 }}
                          whileTap={{ scale: 0.85 }}
                          onClick={() => updateMe({ color: c })}
                          className={`size-6 rounded-full shadow-md ${active ? "ring-2 ring-offset-2 ring-offset-transparent" : ""}`}
                          style={{ backgroundColor: c, boxShadow: active ? `0 0 0 2px ${c}` : undefined }}
                          aria-label={`Color ${c}`}
                        >
                          {active && <Check className="size-3.5 text-white mx-auto" strokeWidth={3} />}
                        </motion.button>
                      );
                    })}
                    <label
                      className="relative size-6 rounded-full shadow-md cursor-pointer overflow-hidden flex items-center justify-center ring-1 ring-black/10"
                      title="Elegir un color personalizado"
                      style={{ background: "conic-gradient(from 180deg, #ef4444, #f59e0b, #84cc16, #22d3ee, #3b82f6, #a855f7, #ef4444)" }}
                    >
                      <Pipette className="size-3 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]" />
                      <input
                        type="color"
                        value={me.color || "#7c5cff"}
                        onChange={(e) => updateMe({ color: e.target.value })}
                        className="absolute inset-0 size-full opacity-0 cursor-pointer"
                      />
                    </label>
                  </div>

                  {/* ---- Forward Token ---- */}
                  <label className={`text-xs ${t.textMuted} flex items-center gap-1 mb-1.5`}>
                    <KeyRound className="size-3" /> TU FORWARD TOKEN
                  </label>
                  <button
                    onClick={copyFriendCode}
                    className={`w-full mb-6 flex items-center justify-between gap-2 px-4 py-3 rounded-xl ${t.inputBg} border ${t.border} hover:opacity-80 transition-opacity`}
                  >
                    <span className="font-pixel-ui tracking-widest text-sm">{friendCode || "Conectando..."}</span>
                    <Copy className={`size-4 ${t.textMuted}`} />
                  </button>

                  <div className="grid grid-cols-2 gap-3">
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }} onClick={() => setShowProfile(false)} className={`py-3 rounded-xl ${t.iconBtn}`}>
                      Cancelar
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        const finalName = tempName.trim() || me.name || "anónimo";
                        updateMe({ name: finalName, bio: tempBio.trim() });
                        setShowProfile(false);
                        toast.success("Perfil guardado ✨");
                      }}
                      className={`py-3 rounded-xl text-white ${t.accent} ${t.accentHover} shadow-lg flex items-center justify-center gap-2`}
                    >
                      <Check className="size-4" />
                      Guardar
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ============ LLAMADAS (WebRTC) ============ */}
        <IncomingCallModal rtc={rtc} participants={participants} theme={t} />
        <CallOverlay rtc={rtc} participants={participants} selfId={selfId} theme={t} />
      </div>
    </div>
    </MotionConfig>
  );
}

function AnimatedDots() {
  return (
    <span className="inline-flex w-4">
      <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0 }}>.</motion.span>
      <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}>.</motion.span>
      <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}>.</motion.span>
    </span>
  );
}

function ChatListItem({
  theme: t,
  icon,
  title,
  subtitle,
  meta,
  unread,
  onClick,
}: {
  theme: ThemeTokens;
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle: string;
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
        <div className={`text-xs truncate ${t.textMuted}`}>{subtitle}</div>
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

function PermissionRow({
  icon,
  label,
  enabled,
  onToggle,
  theme: t,
}: {
  icon: React.ReactNode;
  label: string;
  enabled: boolean;
  onToggle: () => void;
  theme: ThemeTokens;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 text-left transition-colors"
      role="switch"
      aria-checked={enabled}
      aria-label={`${label}: ${enabled ? "activado" : "desactivado"}`}
    >
      <span className={enabled ? t.accentText : t.textMuted}>{icon}</span>
      <span className="flex-1 text-sm">{label}</span>
      <span
        className={`w-10 h-5 rounded-full p-0.5 flex items-center transition-colors ${
          enabled ? `${t.accent} justify-end` : "bg-white/15 justify-start"
        }`}
      >
        <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 30 }} className="size-4 rounded-full bg-white shadow" />
      </span>
    </button>
  );
}

function MenuItem({ icon, label, onClick, mutedColor }: { icon: React.ReactNode; label: string; onClick?: () => void; mutedColor: string }) {
  return (
    <motion.button
      variants={{
        hidden: { opacity: 0, x: -20 },
        show: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 320, damping: 24 } },
      }}
      whileHover={{ x: 4 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-white/5 text-left transition-colors"
    >
      <span className={mutedColor}>{icon}</span>
      <span>{label}</span>
    </motion.button>
  );
}
