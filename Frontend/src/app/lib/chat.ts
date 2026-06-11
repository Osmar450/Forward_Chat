import { Circle, CircleOff, MinusCircle, Moon, Heart, ThumbsUp, Laugh, Frown, Flame, Angry } from "lucide-react";
import type React from "react";

export const BOT_ID = "forwardbot";
export const LOBBY = "lobby";

/** Clave de conversación DM en el servidor: ids ordenados unidos por "|". */
export const dmScopeOf = (a: string, b: string) => [a, b].sort().join("|");

export type Status = "online" | "idle" | "dnd" | "invisible" | "offline";

export type ReactionKey = "heart" | "thumb" | "laugh" | "sad" | "fire" | "angry";

export type Participant = {
  id: string;
  name: string;
  color: string;
  avatar?: string | null;
  banner?: string | null;
  bannerColor?: string | null;
  bio?: string;
  status: Status;
  isBot?: boolean;
};

export type MessageKind = "text" | "image" | "audio" | "sticker";

export type ReplyTo = {
  id: string | number;
  authorId: string;
  authorName: string;
  kind: MessageKind;
  text?: string;
};

// Las reacciones llegan del servidor como { "i:heart": [userId, ...] }
export type ReactionMap = Record<string, string[]>;

/** Metadatos OpenGraph que el servidor adjunta a mensajes con URL. */
export type LinkPreview = {
  url: string;
  title: string;
  description?: string | null;
  image?: string | null;
  siteName?: string | null;
};

export type Message = {
  id: string | number;
  /** id local optimista; el eco del servidor lo trae para reconciliar */
  clientId?: string | number;
  /** true mientras espera confirmación del servidor (Optimistic UI) */
  pending?: boolean;
  authorId: string;
  kind: MessageKind;
  text?: string;
  imageUrl?: string;
  audioUrl?: string;
  audioDuration?: number;
  replyTo?: ReplyTo;
  time: string;
  timestamp: number;
  deleted?: boolean;
  /** El autor editó el texto después de enviarlo */
  edited?: boolean;
  /** Respuesta del bot llegando en vivo (fragmentos por socket) */
  streaming?: boolean;
  reactions?: ReactionMap;
  linkPreview?: LinkPreview;
  isBot?: boolean;
};

/** Estado de entrega de un mensaje propio en un DM. */
export type Receipt = "pending" | "sent" | "read";

export const USER_COLORS = [
  "#7c5cff", "#ec4899", "#22d3ee", "#f59e0b", "#10b981",
  "#ef4444", "#a855f7", "#3b82f6", "#84cc16", "#f97316",
];

export const BANNER_COLORS = [
  "#7c5cff", "#ec4899", "#22d3ee", "#f59e0b", "#10b981",
  "#ef4444", "#3b82f6", "#1e293b", "#831843", "#14532d",
];

export const AUDIO_MIME_TYPES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

export const STATUSES: Record<Status, { label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string; fill?: string }> }> = {
  online: { label: "En línea", color: "text-emerald-400", bg: "bg-emerald-500", icon: Circle },
  idle: { label: "Ausente", color: "text-yellow-400", bg: "bg-yellow-500", icon: Moon },
  dnd: { label: "No molestar", color: "text-red-400", bg: "bg-red-500", icon: MinusCircle },
  invisible: { label: "Invisible", color: "text-slate-400", bg: "bg-slate-500", icon: CircleOff },
  offline: { label: "Desconectado", color: "text-slate-500", bg: "bg-slate-600", icon: CircleOff },
};

export const REACTIONS: { key: ReactionKey; icon: React.ComponentType<{ className?: string }>; color: string; label: string }[] = [
  { key: "heart", icon: Heart, color: "text-red-500", label: "Me encanta" },
  { key: "thumb", icon: ThumbsUp, color: "text-blue-400", label: "Me gusta" },
  { key: "laugh", icon: Laugh, color: "text-yellow-400", label: "Divertido" },
  { key: "sad", icon: Frown, color: "text-cyan-400", label: "Triste" },
  { key: "fire", icon: Flame, color: "text-orange-500", label: "Genial" },
  { key: "angry", icon: Angry, color: "text-red-600", label: "Enojado" },
];

export const messagePreview = (kind: MessageKind, text?: string) => {
  const trimmed = text?.trim();
  if (kind === "image") return trimmed || "Foto";
  if (kind === "audio") return "Audio";
  if (kind === "sticker") return "Sticker";
  return trimmed || "Mensaje";
};

export const colorForUser = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return USER_COLORS[hash % USER_COLORS.length];
};

export const fmtTime = (sec: number) => {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

export const fmtClock = (ts?: number | string) =>
  (ts ? new Date(ts) : new Date()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();

// ==========================================
// FECHAS INTELIGENTES (separadores y lista de chats)
// ==========================================
const DAY_MS = 24 * 60 * 60 * 1000;

/** Mensajes consecutivos del mismo autor dentro de esta ventana se agrupan. */
export const GROUP_GAP_MS = 5 * 60 * 1000;

export const startOfDay = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export const isSameDay = (a: number, b: number) => startOfDay(a) === startOfDay(b);

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Etiqueta de separador de día: "Hoy", "Ayer", "Lunes", "12 mar 2025". */
export const fmtDayLabel = (ts: number) => {
  const today = startOfDay(Date.now());
  const day = startOfDay(ts);
  if (day === today) return "Hoy";
  if (day === today - DAY_MS) return "Ayer";
  const d = new Date(ts);
  if (today - day < 7 * DAY_MS) return capitalize(d.toLocaleDateString("es", { weekday: "long" }));
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("es", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
};

/** Hora compacta para la lista de chats: "3:24 pm", "Ayer", "Lun", "04/02". */
export const fmtSmartTime = (ts: number) => {
  const today = startOfDay(Date.now());
  const day = startOfDay(ts);
  if (day === today) return fmtClock(ts);
  if (day === today - DAY_MS) return "Ayer";
  if (today - day < 7 * DAY_MS) return capitalize(new Date(ts).toLocaleDateString("es", { weekday: "short" }));
  return new Date(ts).toLocaleDateString("es", { day: "2-digit", month: "2-digit" });
};

export const pickRecorderMimeType = () => {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  return AUDIO_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
};

/**
 * Redimensiona una imagen en el navegador antes de guardarla como dataURL.
 * Ahorra ancho de banda y almacenamiento (avatares 256px, banners 1024px).
 */
export const downscaleImage = (file: File, maxDim: number, quality = 0.85): Promise<string> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas no soportado"));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen"));
    };
    img.src = url;
  });

/** Convierte el payload del servidor en un Message del cliente. */
export const parseServerMessage = (
  data: import("./socketEvents").ServerMessagePayload & { edited?: boolean },
  resolveMediaUrl: (u?: string | null) => string | undefined
): Message => {
  const isSticker = data.kind === "sticker" || data.text === "sticker_file";
  const hasImage = (data.imageUrls && data.imageUrls.length > 0) || data.imageUrl;
  const ts = data.timestamp ? new Date(data.timestamp).getTime() : Date.now();
  return {
    id: data.msgId ?? `${ts}-${Math.random().toString(36).slice(2, 7)}`,
    clientId: data.clientId ?? undefined,
    authorId: data.userId || data.id || "",
    kind: (isSticker ? "sticker" : hasImage ? "image" : data.audioUrl ? "audio" : "text") as MessageKind,
    text: isSticker || data.text === "sticker_file" ? undefined : (data.text || undefined),
    imageUrl: resolveMediaUrl((data.imageUrls && data.imageUrls[0]) || data.imageUrl || undefined),
    audioUrl: resolveMediaUrl(data.audioUrl || undefined),
    audioDuration: typeof data.audioDuration === "number" ? data.audioDuration : undefined,
    replyTo: data.replyTo || undefined,
    time: fmtClock(ts),
    timestamp: ts,
    deleted: !!data.deleted,
    edited: !!data.edited,
    reactions: data.reactions && typeof data.reactions === "object" ? data.reactions : undefined,
    linkPreview: data.linkPreview || undefined,
    isBot: data.isBot || data.userId === "forwardbot",
  };
};
