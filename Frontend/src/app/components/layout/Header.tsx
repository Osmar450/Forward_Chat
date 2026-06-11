import React, { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Bot, Check, ChevronDown, Hash, Menu, MessageSquare, Phone, Search, Sparkles, Users, Video } from "lucide-react";
import type { ThemeTokens } from "../../lib/themes";
import { LOBBY, Participant, STATUSES, Status } from "../../lib/chat";
import type { WebRTCApi } from "../../hooks/useWebRTC";
import { AnimatedDots } from "../common/AnimatedDots";

/**
 * Barra superior: navegación, datos del chat activo (o branding en inicio),
 * botones de llamada y acceso al perfil propio con selector de estado.
 */
export function Header({
  theme: t,
  me,
  inChat,
  activeChat,
  activePeer,
  typingNames,
  onlineCount,
  rtc,
  latencyMs,
  isConnected,
  searchOpen,
  showBackIcon,
  onNavClick,
  onOpenProfile,
  onOpenMembers,
  onViewPeerProfile,
  onSetStatus,
  onToggleSearch,
}: {
  theme: ThemeTokens;
  me: Participant;
  inChat: boolean;
  activeChat: string | null;
  activePeer: Participant | null;
  typingNames: string[];
  onlineCount: number;
  rtc: WebRTCApi;
  latencyMs: number | null;
  isConnected: boolean;
  searchOpen: boolean;
  showBackIcon: boolean;
  onNavClick: () => void;
  onOpenProfile: () => void;
  onOpenMembers: () => void;
  onViewPeerProfile: () => void;
  onSetStatus: (s: Status) => void;
  onToggleSearch: () => void;
}) {
  const [statusOpen, setStatusOpen] = useState(false);

  // Calidad de conexión derivada del RTT del socket
  const connQuality = !isConnected || latencyMs === null
    ? { color: "bg-red-500", label: "Sin conexión" }
    : latencyMs < 120
      ? { color: "bg-emerald-500", label: `Conexión estable · ${latencyMs} ms` }
      : latencyMs < 350
        ? { color: "bg-yellow-500", label: `Conexión moderada · ${latencyMs} ms` }
        : { color: "bg-red-500", label: `Conexión lenta · ${latencyMs} ms` };

  return (
    <motion.header
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 280, damping: 26 }}
      className={`flex items-center gap-3 px-4 py-3 ${t.panel} border-b ${t.border} backdrop-blur-sm z-30 shrink-0`}
    >
      <motion.button
        whileTap={{ scale: 0.9 }}
        whileHover={{ scale: 1.05 }}
        onClick={onNavClick}
        className={`p-2 rounded-lg ${t.iconBtn} transition-colors`}
        aria-label={inChat ? "Regresar" : "Abrir menú"}
      >
        {showBackIcon ? <ArrowLeft className="size-5" /> : <Menu className="size-5" />}
      </motion.button>

      {inChat ? (
        <>
          {/* Cabecera del chat activo */}
          <button
            onClick={onViewPeerProfile}
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
                {typingNames.length > 0 ? (
                  <span className={t.accentText}>
                    {typingNames.join(", ")} está escribiendo
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
            <motion.button
              whileTap={{ scale: 0.9 }}
              whileHover={{ scale: 1.05 }}
              onClick={onToggleSearch}
              className={`p-2 rounded-lg ${searchOpen ? `${t.accent} text-white` : t.iconBtn}`}
              aria-label="Buscar en el chat"
              aria-pressed={searchOpen}
            >
              <Search className="size-4.5" />
            </motion.button>
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
                  onClick={onOpenMembers}
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
            <div className="truncate font-display text-sm flex items-center gap-2">
              Forward_Chat
              <span
                className={`size-1.5 rounded-full ${connQuality.color} ${isConnected ? "" : "animate-pulse"}`}
                title={connQuality.label}
                role="status"
                aria-label={connQuality.label}
              />
            </div>
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
                              onSetStatus(s);
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
            onClick={onOpenProfile}
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
  );
}
