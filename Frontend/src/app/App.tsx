import React, { useState, useRef, useEffect, useMemo } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { toast } from "sonner";
import { Toaster } from "./components/ui/sonner";
import { ImageDown, WifiOff } from "lucide-react";
import { themes, Theme } from "./lib/themes";
import {
  BOT_ID,
  LOBBY,
  Message,
  Participant,
  ReplyTo,
  USER_COLORS,
  downscaleImage,
  fmtClock,
  messagePreview,
} from "./lib/chat";
import { useChatSocket } from "./hooks/useChatSocket";
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

/**
 * App: composición y estado de UI. La lógica de tiempo real vive en
 * useChatSocket; la de llamadas en useWebRTC; la de grabación en
 * useAudioRecorder. Este componente solo orquesta y renderiza.
 */
export default function App() {
  // ==========================================
  // PREFERENCIAS LOCALES (tema, eco, permisos)
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

  useEffect(() => {
    localStorage.setItem("chatTheme", theme);
  }, [theme]);
  useEffect(() => {
    localStorage.setItem("chatEcoMode", ecoMode ? "1" : "0");
  }, [ecoMode]);
  useEffect(() => {
    localStorage.setItem("chatPermissions", JSON.stringify(perms));
  }, [perms]);

  // ==========================================
  // ESTADO DE UI
  // ==========================================
  const [activeChat, setActiveChat] = useState<string | null>(null); // null = pantalla de inicio
  const [isAtBottom, setIsAtBottom] = useState(true);
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
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  // Búsqueda dentro del chat activo
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  // Divisor "mensajes nuevos" al abrir un chat con pendientes
  const [unreadMarker, setUnreadMarker] = useState<{ chat: string; id: string | number } | null>(null);

  const replyingToRef = useRef<Message | null>(null);
  const activeChatRef = useRef<string | null>(null);
  const prevChatRef = useRef<string | null | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  replyingToRef.current = replyingTo;
  activeChatRef.current = activeChat;

  const backendUrl = import.meta.env.DEV ? "http://localhost:3000" : (typeof window !== "undefined" ? window.location.origin : "/");
  const t = themes[theme];

  // ==========================================
  // CAPA DE TIEMPO REAL (toda la lógica de socket vive en el hook)
  // ==========================================
  const chat = useChatSocket({
    backendUrl,
    activeChat,
    isAtBottom,
    onOwnEcho: () => setReplyingTo(null),
  });
  const {
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
  } = chat;

  const participantsRef = useRef(participants);
  participantsRef.current = participants;

  const rtc = useWebRTC(socket, selfId, {
    mic: () => permsRef.current.mic,
    cam: () => permsRef.current.cam,
  });

  const me: Participant = participants[selfId] || {
    id: selfId,
    name: selfId || "Cargando...",
    color: USER_COLORS[0],
    status: "online",
  };
  const draft = drafts[activeChat || LOBBY] || "";
  const activeMessages = activeChat ? chats[activeChat] || [] : [];

  // ==========================================
  // PERSISTENCIA DE STICKERS
  // ==========================================
  useEffect(() => {
    try {
      const savedStickers = localStorage.getItem("chatStickers");
      const savedFavs = localStorage.getItem("chatFavoriteStickers");
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

  // ==========================================
  // EFECTOS DE NAVEGACIÓN Y SCROLL
  // ==========================================

  // Abrir un chat: pedir historial DM, fijar divisor de no leídos y limpiar composer
  useEffect(() => {
    if (activeChat && activeChat !== LOBBY && isConnected) {
      chat.requestDmHistory(activeChat);
    }
    if (activeChat) {
      const count = unread[activeChat] || 0;
      const list = chats[activeChat] || [];
      setUnreadMarker(count > 0 && list.length >= count ? { chat: activeChat, id: list[list.length - count].id } : null);
      chat.setUnread((u) => ({ ...u, [activeChat]: 0 }));
      chat.resetUnreadCount();
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
    if (isAtBottom || (lastMsg && lastMsg.authorId === selfId)) {
      el.scrollTo({ top: el.scrollHeight, behavior: ecoMode ? "auto" : "smooth" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMessages.length, lastMsg?.text, activeChat, ecoMode, selfId]);

  // Listener de scroll (botón "ir abajo" + contador)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 100;
      setIsAtBottom(atBottom);
      if (atBottom) chat.resetUnreadCount();
    };
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const handleAvatarFile = async (file: File) => {
    try {
      const dataUrl = await downscaleImage(file, 256);
      chat.updateMe({ avatar: dataUrl });
      toast.success("Foto de perfil actualizada");
    } catch {
      toast.error("No se pudo procesar la imagen");
    }
  };

  const handleBannerFile = async (file: File) => {
    try {
      const dataUrl = await downscaleImage(file, 1024, 0.8);
      chat.updateMe({ banner: dataUrl, bannerColor: null });
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

  const onDraftChange = (val: string) => {
    setDraft(val);
    chat.emitTyping();
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

  const appendLocal = (msg: Omit<Message, "id" | "time" | "timestamp">) => {
    const ts = Date.now();
    const local: Message = {
      ...msg,
      id: `local-${ts}-${Math.random().toString(36).slice(2, 7)}`,
      time: fmtClock(ts),
      timestamp: ts,
    };
    chat.setChats((prev) => ({ ...prev, [activeChatRef.current || LOBBY]: [...(prev[activeChatRef.current || LOBBY] || []), local] }));
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
    chat.setChats((prev) => ({
      ...prev,
      [chatKey]: [...(prev[chatKey] || []), { id: clientMsgId, authorId: selfId, kind: "text" as const, text, replyTo, time: fmtClock(ts), timestamp: ts, pending: true }],
    }));
    setReplyingTo(null);
    if (chat.emitMessage({ msgId: clientMsgId, text, replyTo })) {
      // Rollback silencioso: si en 10s el servidor no confirmó, quitar la marca de pendiente
      setTimeout(() => {
        chat.setChats((prev) => {
          const list = prev[chatKey] || [];
          if (!list.some((m) => m.id === clientMsgId && m.pending)) return prev;
          return { ...prev, [chatKey]: list.map((m) => (m.id === clientMsgId ? { ...m, pending: false } : m)) };
        });
      }, 10000);
    } else {
      chat.setChats((prev) => ({
        ...prev,
        [chatKey]: (prev[chatKey] || []).map((m) => (m.id === clientMsgId ? { ...m, pending: false } : m)),
      }));
      toast.warning("Sin conexión: el mensaje solo es visible para ti.");
    }
    setMentionSearch(null);
    chat.clearTypingState();
  };

  const sendText = () => {
    if (!draft.trim()) return;
    sendTextValue(draft);
    setDraft("");
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
    if (trimmed && trimmed !== m.text) chat.editMessage(m.id, trimmed);
    setEditingMsg(null);
  };

  const sendSticker = (url: string) => {
    const replyTo = buildReplyRef(replyingTo);
    if (!chat.emitMessage({ kind: "sticker", imageUrls: [url], replyTo })) {
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
    return Array.isArray(json.files) ? (json.files as { url?: string }[]) : [];
  };

  const queueImage = (file: File) => {
    const previewUrl = URL.createObjectURL(file);
    setPendingImage({ file, previewUrl, caption: "" });
  };

  // ==========================================
  // DRAG & DROP DE ARCHIVOS SOBRE EL CHAT
  // El contador de profundidad evita parpadeos al pasar sobre hijos.
  // ==========================================
  const [dragActive, setDragActive] = useState(false);
  const dragDepthRef = useRef(0);

  const dragHasFiles = (e: React.DragEvent) =>
    Array.from(e.dataTransfer?.types || []).includes("Files");

  const onDragEnter = (e: React.DragEvent) => {
    if (!activeChatRef.current !== null || !dragHasFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setDragActive(true);
  };

  const onDragOver = (e: React.DragEvent) => {
    if (!activeChatRef.current !== null || !dragHasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const onDragLeave = (e: React.DragEvent) => {
    if (!dragHasFiles(e)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  };

  const onDrop = (e: React.DragEvent) => {
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setDragActive(false);
    if (!activeChatRef.current !== null) return;
    const files = Array.from(e.dataTransfer?.files || []);
    const image = files.find((f) => f.type.startsWith("image/"));
    if (image) {
      // Vista previa local (ImagePreviewModal) antes de subir nada al backend
      queueImage(image);
    } else if (files.length > 0) {
      toast.error("Ese tipo de archivo no se puede enviar; prueba con una imagen.");
    }
  };

  const confirmSendImage = async () => {
    if (!pendingImage) return;
    const caption = pendingImage.caption.trim() || undefined;
    const replyTo = buildReplyRef(replyingToRef.current);
    const previewUrl = pendingImage.previewUrl;
    const file = pendingImage.file;
    setPendingImage(null);
    if (isConnected) {
      try {
        const uploaded = await uploadFiles([file]);
        const uploadedUrl = chat.resolveMediaUrl(uploaded[0]?.url);
        if (!uploadedUrl) throw new Error("upload");
        chat.emitMessage({ imageUrls: [uploadedUrl], text: caption, replyTo });
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
      if (isConnected) {
        try {
          const uploaded = await uploadFiles([file]);
          const uploadedUrl = chat.resolveMediaUrl(uploaded[0]?.url);
          if (!uploadedUrl) throw new Error("upload");
          chat.emitMessage({ audioUrl: uploadedUrl, audioDuration: duration, replyTo });
          return;
        } catch {
          toast.error("No se pudo subir el audio; se muestra solo localmente.");
        }
      }
      appendLocal({ authorId: selfId, kind: "audio", audioUrl: localUrl, audioDuration: duration, replyTo });
    }
  );

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

  // Búsqueda en el servidor (string exacto) con debounce: cubre mensajes
  // que aún no están cargados localmente; los resultados se fusionan al chat.
  useEffect(() => {
    if (!searchOpen || !activeChat) return;
    const q = searchQuery.trim();
    if (q.length < 2) return;
    const timer = window.setTimeout(() => chat.searchMessages(q), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, searchOpen, activeChat]);

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
      <div
        className={`relative w-full max-w-md h-[100dvh] md:h-[90vh] md:rounded-2xl overflow-hidden flex flex-col ${t.border} border ${t.bg}`}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
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
          onSetStatus={(s) => chat.updateMe({ status: s })}
          onToggleSearch={() => {
            setSearchOpen((o) => {
              if (o) setSearchQuery("");
              return !o;
            });
          }}
        />

        {/* Overlay de drag & drop: "suelta para enviar" */}
        <AnimatePresence>
          {dragActive && inChat && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none"
              aria-hidden="true"
            >
              <div
                className={`flex flex-col items-center gap-3 px-10 py-8 rounded-2xl border-2 border-dashed ${t.panel}`}
                style={{ borderColor: t.accentHex }}
              >
                <motion.span
                  animate={{ y: [0, 6, 0] }}
                  transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
                >
                  <ImageDown className="size-10" style={{ color: t.accentHex }} />
                </motion.span>
                <span className={`font-pixel-ui tracking-widest text-sm ${t.text}`}>SUELTA PARA ENVIAR</span>
                <span className={`text-xs ${t.textMuted}`}>Verás una vista previa antes de mandarlo</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
            typingUsers={typingUsers}
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
              searchQuery={searchQuery}
              currentSearchId={currentSearchId}
              serverHasMore={!!historyMore[activeChat!]}
              onLoadOlder={chat.requestOlderMessages}
              openMenuFor={openMenuFor}
              onTogglePicker={(id) => setOpenMenuFor((cur) => (cur === id ? null : id))}
              onClosePicker={() => setOpenMenuFor(null)}
              onDelete={(id) => {
                chat.deleteMessage(id);
                setOpenMenuFor(null);
              }}
              onReact={(id, rid) => {
                chat.toggleReaction(id, rid);
                setOpenMenuFor(null);
              }}
              onReply={(m) => setReplyingTo(m)}
              onEdit={startEditing}
              onViewProfile={(id) => setViewProfileId(id)}
              onSaveSticker={saveSticker}
              formatText={formatText}
              onScrollToBottom={() => {
                scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
                chat.resetUnreadCount();
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
              typingNames={typingNames}
              onDraftChange={onDraftChange}
              onKeyDown={onDraftKeyDown}
              onSend={sendText}
              replyingTo={replyingTo}
              onCancelReply={() => setReplyingTo(null)}
              editingMsg={editingMsg}
              onSubmitEdit={submitEdit}
              onCancelEdit={() => setEditingMsg(null)}
              quickSuggestions={activeMessages.length <= 1 ? botSuggestions : []}
              onQuickSuggestion={sendTextValue}
              smartReplies={activeChat !== LOBBY ? smartReplies[activeChat!] || [] : []}
              onSmartReply={sendTextValue}
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
            chat.setChats((prev) => ({ ...prev, [activeChatRef.current || LOBBY]: [] }));
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
          onAddFriend={chat.addFriend}
          onClose={() => setShowFriends(false)}
          onViewProfile={(id) => setViewProfileId(id)}
          onOpenChat={(id) => setActiveChat(id)}
          onRemoveFriend={chat.removeFriend}
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
          updateMe={chat.updateMe}
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
