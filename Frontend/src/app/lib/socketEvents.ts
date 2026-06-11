import type { LinkPreview, ReactionMap, ReplyTo, Status } from "./chat";

// ==========================================
// CONTRATOS TIPADOS DEL PROTOCOLO SOCKET.IO
// Una sola fuente de verdad para los payloads servidor -> cliente.
// ==========================================

/** Perfil público tal como viaja por el socket. */
export interface ProfilePayload {
  userId: string;
  name?: string;
  color?: string | null;
  avatar?: string | null;
  banner?: string | null;
  bannerColor?: string | null;
  bio?: string;
  status?: Status;
  isBot?: boolean;
}

export interface SessionProfilePayload extends ProfilePayload {
  friendCode?: string;
}

/** Mensaje tal como lo emite/almacena el servidor (lobby y DM). */
export interface ServerMessagePayload {
  msgId?: string | number;
  clientId?: string | number | null;
  userId?: string;
  id?: string;
  to?: string;
  text?: string;
  kind?: string;
  imageUrls?: string[];
  imageUrl?: string;
  audioUrl?: string | null;
  audioDuration?: number;
  replyTo?: ReplyTo | null;
  reactions?: ReactionMap;
  linkPreview?: LinkPreview | null;
  timestamp?: string | number;
  deleted?: boolean;
  isBot?: boolean;
  profile?: ProfilePayload;
  scope?: string;
}

export interface DmHistoryPayload {
  with: string;
  scope: string;
  messages: ServerMessagePayload[];
  hasMore?: boolean;
  reads?: Record<string, number>;
}

export interface HistoryMetaPayload {
  with: string;
  hasMore: boolean;
}

export interface OlderMessagesPayload {
  with: string;
  messages: ServerMessagePayload[];
  hasMore: boolean;
}

export interface SearchResultsPayload {
  with: string;
  query: string;
  total: number;
  messages: ServerMessagePayload[];
}

export interface ReactionUpdatedPayload {
  scope: string;
  msgId: string | number;
  reactions: ReactionMap;
}

export interface MessageDeletedPayload {
  scope?: string;
  msgId: string | number;
}

export interface MessageEditedPayload {
  scope?: string;
  msgId: string | number;
  text: string;
  edited: boolean;
}

export interface TypingPayload {
  scope: string;
  userId: string;
  name?: string;
  typing: boolean;
}

export interface DmReadPayload {
  scope: string;
  by: string;
  at?: number;
}

export interface BotStreamPayload {
  scope: string;
  streamId: string;
  text: string;
  done: boolean;
}

export interface LinkPreviewPayload {
  scope: string;
  msgId: string | number;
  preview: LinkPreview;
}

export interface FriendAddedPayload {
  profile?: ProfilePayload;
}

export interface ErrorToastPayload {
  message?: string;
}

/** Resuelve la clave de chat local a partir del scope del servidor. */
export const chatKeyFromScope = (scope: string | undefined, selfId: string, lobbyKey: string): string => {
  const s = scope || lobbyKey;
  if (s === lobbyKey) return lobbyKey;
  return s.split("|").find((p) => p !== selfId) || s;
};
