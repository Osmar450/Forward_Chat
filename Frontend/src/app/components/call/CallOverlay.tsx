import React, { useEffect, useRef, useState } from "react";

/** Fuerza la reproducción de un elemento de media; si el navegador bloquea
 *  el autoplay, reintenta en el siguiente toque/click del usuario. */
function playWithGestureFallback(el: HTMLMediaElement) {
  let removed = false;
  const resume = () => {
    removed = true;
    el.play().catch(() => {});
  };
  el.play().catch(() => {
    if (!removed) window.addEventListener("pointerdown", resume, { once: true });
  });
  return () => window.removeEventListener("pointerdown", resume);
}

/** Reproduce el audio de un stream remoto. Usa <audio> para evitar
 *  el bloqueo de autoplay que Safari aplica a <video display:none>. */
function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    return playWithGestureFallback(el);
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline />;
}
import { AnimatePresence, motion } from "motion/react";
import { Maximize2, Mic, MicOff, Minimize2, PhoneOff, Video as VideoIcon, VideoOff } from "lucide-react";
import type { ThemeTokens } from "../../lib/themes";
import type { Participant } from "../../lib/chat";
import type { WebRTCApi } from "../../hooks/useWebRTC";

/** Asigna el MediaStream al elemento sin re-crear el nodo. */
function MediaVideo({
  stream,
  muted = false,
  mirrored = false,
  className = "",
}: {
  stream: MediaStream | null;
  muted?: boolean;
  mirrored?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    return playWithGestureFallback(el);
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={`${className} ${mirrored ? "scale-x-[-1]" : ""}`}
    />
  );
}

const hasLiveVideo = (stream: MediaStream | null) =>
  !!stream && stream.getVideoTracks().some((tr) => tr.enabled && tr.readyState === "live");

/** Detecta al hablante activo midiendo niveles de audio cada 400ms. */
function useActiveSpeaker(streams: Record<string, MediaStream>) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const analysersRef = useRef<Map<string, { ctx: AudioContext; analyser: AnalyserNode }>>(new Map());

  useEffect(() => {
    const map = analysersRef.current;
    // Crear analizadores para streams nuevos
    Object.entries(streams).forEach(([id, stream]) => {
      if (map.has(id) || stream.getAudioTracks().length === 0) return;
      try {
        const ctx = new AudioContext();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        map.set(id, { ctx, analyser });
      } catch { /* AudioContext bloqueado: sin detección */ }
    });
    // Limpiar los que ya no existen
    Array.from(map.keys()).forEach((id) => {
      if (!(id in streams)) {
        map.get(id)?.ctx.close().catch(() => {});
        map.delete(id);
      }
    });

    const interval = window.setInterval(() => {
      let loudest: string | null = null;
      let max = 12; // umbral mínimo para considerar "hablando"
      const data = new Uint8Array(128);
      map.forEach(({ analyser }, id) => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        if (avg > max) {
          max = avg;
          loudest = id;
        }
      });
      setActiveId(loudest);
    }, 400);

    return () => clearInterval(interval);
  }, [streams]);

  useEffect(() => {
    return () => {
      analysersRef.current.forEach(({ ctx }) => ctx.close().catch(() => {}));
      analysersRef.current.clear();
    };
  }, []);

  return activeId;
}

function VideoTile({
  stream,
  participant,
  label,
  theme: t,
  muted = false,
  mirrored = false,
  isSpeaking = false,
  small = false,
}: {
  stream: MediaStream | null;
  participant?: Participant | null;
  label: string;
  theme: ThemeTokens;
  muted?: boolean;
  mirrored?: boolean;
  isSpeaking?: boolean;
  small?: boolean;
}) {
  const showVideo = hasLiveVideo(stream);
  return (
    <div
      className={`relative rounded-2xl overflow-hidden bg-black/60 flex items-center justify-center transition-shadow ${
        isSpeaking ? `ring-2 ${t.accentRing} shadow-[0_0_18px_rgba(124,92,255,0.45)]` : "ring-1 ring-white/10"
      } ${small ? "" : "min-h-32"}`}
    >
      <MediaVideo stream={stream} muted={muted} mirrored={mirrored} className={`size-full object-cover ${showVideo ? "" : "hidden"}`} />
      {!showVideo && (
        <div className="flex flex-col items-center gap-2 py-6">
          <div
            className={`${small ? "size-10 text-base" : "size-16 text-2xl"} rounded-full flex items-center justify-center text-white overflow-hidden shadow-lg ${
              isSpeaking ? "ring-2 ring-emerald-400" : ""
            }`}
            style={{ backgroundColor: participant?.color || "#7c5cff" }}
          >
            {participant?.avatar ? (
              <img src={participant.avatar} alt="" className="size-full object-cover" />
            ) : (
              label.charAt(0).toUpperCase()
            )}
          </div>
        </div>
      )}
      <div className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-md bg-black/55 backdrop-blur text-white text-[10px] max-w-[80%] truncate">
        {label}
      </div>
    </div>
  );
}

function ControlBar({
  rtc,
  theme: t,
  expanded,
  onToggleExpand,
  compact = false,
}: {
  rtc: WebRTCApi;
  theme: ThemeTokens;
  expanded: boolean;
  onToggleExpand: () => void;
  compact?: boolean;
}) {
  const size = compact ? "size-9" : "size-12";
  const icon = compact ? "size-4" : "size-5";
  return (
    <div className={`flex items-center justify-center ${compact ? "gap-1.5" : "gap-3"}`}>
      <motion.button
        whileTap={{ scale: 0.88 }}
        onClick={rtc.toggleMute}
        className={`${size} rounded-full flex items-center justify-center shadow-lg transition-colors ${
          rtc.muted ? "bg-white text-black" : "bg-white/15 hover:bg-white/25 text-white"
        }`}
        aria-label={rtc.muted ? "Activar micrófono" : "Silenciar"}
      >
        {rtc.muted ? <MicOff className={icon} /> : <Mic className={icon} />}
      </motion.button>
      {rtc.callKind === "video" && (
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={rtc.toggleCamera}
          className={`${size} rounded-full flex items-center justify-center shadow-lg transition-colors ${
            rtc.cameraOff ? "bg-white text-black" : "bg-white/15 hover:bg-white/25 text-white"
          }`}
          aria-label={rtc.cameraOff ? "Encender cámara" : "Apagar cámara"}
        >
          {rtc.cameraOff ? <VideoOff className={icon} /> : <VideoIcon className={icon} />}
        </motion.button>
      )}
      <motion.button
        whileTap={{ scale: 0.88 }}
        onClick={onToggleExpand}
        className={`${size} rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center shadow-lg`}
        aria-label={expanded ? "Minimizar" : "Pantalla completa"}
      >
        {expanded ? <Minimize2 className={icon} /> : <Maximize2 className={icon} />}
      </motion.button>
      <motion.button
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.88 }}
        onClick={rtc.hangUp}
        className={`${size} rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg shadow-red-500/40`}
        aria-label="Colgar"
      >
        <PhoneOff className={icon} />
      </motion.button>
    </div>
  );
}

export function CallOverlay({
  rtc,
  participants,
  selfId,
  theme: t,
}: {
  rtc: WebRTCApi;
  participants: Record<string, Participant>;
  selfId: string;
  theme: ThemeTokens;
}) {
  const [expanded, setExpanded] = useState(false);
  const activeSpeaker = useActiveSpeaker(rtc.remoteStreams);
  const inCall = rtc.callState === "active" || rtc.callState === "outgoing";

  // Las videollamadas abren en grande; las de voz, en PiP
  useEffect(() => {
    if (rtc.callState === "active") setExpanded(rtc.callKind === "video");
    if (rtc.callState === "idle") setExpanded(false);
  }, [rtc.callState, rtc.callKind]);

  if (!inCall) return null;

  const remoteEntries = Object.entries(rtc.remoteStreams);
  const isLobby = rtc.callScope === "lobby";
  const peer = !isLobby && rtc.callScope ? participants[rtc.callScope] : null;
  const title = isLobby ? "Voz del Lobby" : peer?.name || "...";
  const callLabel =
    rtc.callState === "outgoing" ? "Llamando..." : isLobby ? `${remoteEntries.length + 1} en el canal` : "En llamada";

  const nameOf = (id: string) => participants[id]?.name || id;

  return (
    <>
      {/* Audio de TODOS los peers remotos. Se usa <audio> en un contenedor
          de tamaño cero (no display:none) porque Safari bloquea autoplay
          en elementos de video/audio con display:none. */}
      <div aria-hidden="true" style={{ position: "fixed", width: 0, height: 0, overflow: "hidden", opacity: 0, pointerEvents: "none" }}>
        {remoteEntries.map(([id, stream]) => (
          <RemoteAudio key={`audio-${id}`} stream={stream} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {expanded ? (
          /* ============ PANTALLA COMPLETA ============ */
          <motion.div
            key="full"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="absolute inset-0 z-[55] bg-[#0b0a14]/97 backdrop-blur flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 text-white shrink-0">
              <div className="min-w-0">
                <div className="font-display text-sm truncate">{title}</div>
                <div className="text-[11px] text-white/50">{callLabel}</div>
              </div>
            </div>

            {/* Grid responsive: columna en móvil, 2 col con más feeds */}
            <div
              className={`flex-1 min-h-0 overflow-y-auto p-3 grid gap-2 content-center ${
                remoteEntries.length <= 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"
              }`}
            >
              {remoteEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-white/60 text-sm gap-3">
                  <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.4, repeat: Infinity }}>
                    {rtc.callState === "outgoing" ? "Esperando respuesta..." : "Esperando a que alguien se una..."}
                  </motion.div>
                </div>
              ) : (
                remoteEntries.map(([id, stream]) => (
                  <VideoTile
                    key={id}
                    stream={stream}
                    participant={participants[id]}
                    label={nameOf(id)}
                    theme={t}
                    isSpeaking={activeSpeaker === id}
                  />
                ))
              )}
            </div>

            {/* Mi cámara flotante */}
            <div className="absolute bottom-24 right-3 w-24 sm:w-28 aspect-[3/4] z-10">
              <VideoTile
                stream={rtc.localStream}
                participant={participants[selfId]}
                label="Tú"
                theme={t}
                muted
                mirrored
                small
                isSpeaking={false}
              />
            </div>

            <div className="p-4 pb-6 shrink-0">
              <ControlBar rtc={rtc} theme={t} expanded onToggleExpand={() => setExpanded(false)} />
            </div>
          </motion.div>
        ) : (
          /* ============ PiP FLOTANTE (se puede seguir chateando) ============ */
          <motion.div
            key="pip"
            drag
            dragMomentum={false}
            initial={{ opacity: 0, y: -16, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.92 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className={`absolute top-16 right-2 z-40 w-52 rounded-2xl border ${t.borderStrong} bg-[#0b0a14]/95 backdrop-blur shadow-2xl overflow-hidden cursor-grab active:cursor-grabbing`}
          >
            {/* Video principal del PiP (o avatar en llamadas de voz) */}
            {(() => {
              const mainRemote =
                remoteEntries.find(([, s]) => hasLiveVideo(s)) || remoteEntries[0] || null;
              const showLocalCam = !mainRemote && hasLiveVideo(rtc.localStream);
              if (mainRemote || showLocalCam) {
                const [id, stream] = mainRemote || [selfId, rtc.localStream!];
                if (hasLiveVideo(stream)) {
                  return (
                    <div className="relative h-28">
                      <MediaVideo stream={stream} muted={!mainRemote} mirrored={!mainRemote} className="size-full object-cover" />
                      <div className="absolute bottom-1 left-1.5 px-1.5 py-0.5 rounded bg-black/55 text-white text-[9px]">
                        {mainRemote ? nameOf(id) : "Tú"}
                      </div>
                      {remoteEntries.length > 1 && (
                        <div className="absolute top-1 right-1.5 px-1.5 py-0.5 rounded bg-black/55 text-white text-[9px]">
                          +{remoteEntries.length - 1}
                        </div>
                      )}
                    </div>
                  );
                }
              }
              return (
                <div className="flex items-center gap-2.5 px-3 pt-3">
                  <div className="relative">
                    <div
                      className="size-10 rounded-full flex items-center justify-center text-white overflow-hidden shadow-md"
                      style={{ backgroundColor: (isLobby ? participants[activeSpeaker || ""] : peer)?.color || t.accentHex }}
                    >
                      {(() => {
                        const shown = isLobby ? participants[activeSpeaker || remoteEntries[0]?.[0] || ""] : peer;
                        return shown?.avatar ? (
                          <img src={shown.avatar} alt="" className="size-full object-cover" />
                        ) : (
                          (shown?.name || title).charAt(0).toUpperCase()
                        );
                      })()}
                    </div>
                    {activeSpeaker && (
                      <motion.span
                        animate={{ scale: [1, 1.25, 1] }}
                        transition={{ duration: 0.9, repeat: Infinity }}
                        className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-emerald-400 border-2 border-black"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-white">
                    <div className="text-xs truncate">{title}</div>
                    <div className="text-[10px] text-white/50 truncate">{callLabel}</div>
                  </div>
                </div>
              );
            })()}
            <div className="p-2.5">
              <ControlBar rtc={rtc} theme={t} expanded={false} onToggleExpand={() => setExpanded(true)} compact />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
