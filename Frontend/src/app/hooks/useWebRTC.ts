import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { toast } from "sonner";

/**
 * Hook de llamadas WebRTC para ForwardChat.
 * - DMs: P2P directo 1:1 (offer/answer clásico).
 * - Lobby: canal de voz unible (malla P2P; el recién llegado ofrece a los existentes).
 * El socket existente actúa como servidor de señalización. Aislado de App.tsx:
 * no toca nombres, login ni Forward Token.
 */

// TURN (relay) configurable por entorno. Sin TURN, el P2P directo falla entre
// teléfonos con datos móviles, NAT simétrico o wifi con aislamiento de clientes.
// En Frontend/.env defina:
//   VITE_TURN_URLS=turn:host:80,turn:host:443?transport=tcp
//   VITE_TURN_USERNAME=usuario
//   VITE_TURN_CREDENTIAL=clave
// (p. ej. cuenta gratuita de metered.ca, o un coturn propio)
function buildIceServers(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [
    // Varios STUN independientes mejoran el NAT traversal en llamadas a distancia
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:global.stun.twilio.com:3478", "stun:stun.cloudflare.com:3478"] },
  ];
  const turnUrls = (import.meta.env.VITE_TURN_URLS as string | undefined)
    ?.split(",").map((s) => s.trim()).filter(Boolean);
  if (turnUrls?.length) {
    iceServers.push({
      urls: turnUrls,
      username: (import.meta.env.VITE_TURN_USERNAME as string | undefined) || "",
      credential: (import.meta.env.VITE_TURN_CREDENTIAL as string | undefined) || "",
    });
  }
  return { iceServers };
}
const ICE_SERVERS = buildIceServers();

export type CallKind = "audio" | "video";
export type CallState = "idle" | "incoming" | "outgoing" | "active";
/** Calidad de la llamada medida con getStats (RTT + pérdida de paquetes). */
export type CallQuality = "good" | "fair" | "poor" | "reconnecting" | null;

export type IncomingCall = { from: string; fromName: string; kind: CallKind; offer: RTCSessionDescriptionInit };
export type VoiceMember = { userId: string; name: string; video: boolean };

export type WebRTCApi = {
  callState: CallState;
  callKind: CallKind;
  /** peerId del DM o "lobby"; null si no hay llamada */
  callScope: string | null;
  incoming: IncomingCall | null;
  localStream: MediaStream | null;
  /** userId -> stream remoto */
  remoteStreams: Record<string, MediaStream>;
  voiceMembers: VoiceMember[];
  muted: boolean;
  cameraOff: boolean;
  /** Dispositivos disponibles (se llenan al iniciar la llamada) */
  mics: MediaDeviceInfo[];
  cams: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
  micId: string | null;
  camId: string | null;
  /** sinkId para los <audio> remotos; lo aplica la UI de llamada */
  speakerId: string | null;
  callQuality: CallQuality;
  /** RTT de la conexión P2P en ms (null si no se pudo medir) */
  callRtt: number | null;
  startCall: (peerId: string, kind: CallKind) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  hangUp: () => void;
  joinVoice: (kind: CallKind) => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
  setMic: (deviceId: string) => Promise<void>;
  setCam: (deviceId: string) => Promise<void>;
  setSpeaker: (deviceId: string) => void;
  /** Cambia a la siguiente cámara disponible (frontal/trasera en móvil) */
  cycleCamera: () => Promise<void>;
};

const CALL_TIMEOUT_MS = 30000;
const RINGTONE_URL = "/Sounds/Your_Line_Is_Open.mp3";

export type CallPermissions = {
  mic?: () => boolean;
  cam?: () => boolean;
  /** true = No molestar: la llamada entrante no suena ni vibra (solo UI) */
  silent?: () => boolean;
};

export function useWebRTC(socket: Socket | null, selfId: string, perms?: CallPermissions): WebRTCApi {
  const [callState, setCallState] = useState<CallState>("idle");
  const [callKind, setCallKind] = useState<CallKind>("audio");
  const [callScope, setCallScope] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [voiceMembers, setVoiceMembers] = useState<VoiceMember[]>([]);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState<string | null>(null);
  const [camId, setCamId] = useState<string | null>(null);
  const [speakerId, setSpeakerId] = useState<string | null>(null);
  const [callQuality, setCallQuality] = useState<CallQuality>(null);
  const [callRtt, setCallRtt] = useState<number | null>(null);

  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const mutedRef = useRef(false);
  const cameraOffRef = useRef(false);
  const reconnectTimersRef = useRef<Map<string, number>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const callStateRef = useRef<CallState>("idle");
  const callScopeRef = useRef<string | null>(null);
  const callKindRef = useRef<CallKind>("audio");
  const incomingRef = useRef<IncomingCall | null>(null);
  const outgoingTimerRef = useRef<number | null>(null);
  const permsRef = useRef<CallPermissions | undefined>(perms);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);

  permsRef.current = perms;
  callStateRef.current = callState;
  callScopeRef.current = callScope;
  callKindRef.current = callKind;
  incomingRef.current = incoming;
  localStreamRef.current = localStream;
  mutedRef.current = muted;
  cameraOffRef.current = cameraOff;

  // ---------- Permisos (lazy, controlados desde el menú) ----------
  const checkPerms = useCallback((kind: CallKind): boolean => {
    const micOk = permsRef.current?.mic ? permsRef.current.mic() : true;
    const camOk = permsRef.current?.cam ? permsRef.current.cam() : true;
    if (!micOk) {
      toast.error("Activa el Micrófono en el menú de Permisos para usar esta función.");
      return false;
    }
    if (kind === "video" && !camOk) {
      toast.error("Activa la Cámara en el menú de Permisos para usar esta función.");
      return false;
    }
    return true;
  }, []);

  // ---------- Tono de llamada entrante ----------
  // Intenta el mp3 y, si no existe o falla, sintetiza un ring clásico con
  // WebAudio (440+480Hz, cadencia 1s on / 1s off). Así SIEMPRE suena.
  const ringerStopRef = useRef<(() => void) | null>(null);

  const startRinging = useCallback(() => {
    if (ringerStopRef.current) return; // ya está sonando
    // "No molestar": se muestra la llamada entrante pero sin sonido ni vibración
    if (permsRef.current?.silent?.()) return;
    let stopped = false;
    let synthStarted = false;
    let ctx: AudioContext | null = null;
    let synthInterval: number | null = null;

    const startSynth = () => {
      if (stopped || synthStarted) return;
      synthStarted = true;
      try {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        ctx = new AC();
        ctx.resume().catch(() => {});
        const ringOnce = () => {
          if (!ctx || stopped) return;
          const t0 = ctx.currentTime;
          const gain = ctx.createGain();
          gain.connect(ctx.destination);
          gain.gain.setValueAtTime(0.0001, t0);
          gain.gain.linearRampToValueAtTime(0.18, t0 + 0.04);
          gain.gain.setValueAtTime(0.18, t0 + 0.95);
          gain.gain.linearRampToValueAtTime(0.0001, t0 + 1.0);
          [440, 480].forEach((freq) => {
            const osc = ctx!.createOscillator();
            osc.type = "sine";
            osc.frequency.value = freq;
            osc.connect(gain);
            osc.start(t0);
            osc.stop(t0 + 1.05);
          });
        };
        ringOnce();
        synthInterval = window.setInterval(ringOnce, 2000);
      } catch { /* sin soporte de audio */ }
    };

    const audio = new Audio(RINGTONE_URL);
    audio.loop = true;
    ringtoneRef.current = audio;
    audio.addEventListener("error", startSynth);
    audio.play().catch(startSynth); // 404, formato no soportado o autoplay -> respaldo

    try { navigator.vibrate?.([400, 250, 400, 250, 400]); } catch { /* sin vibración */ }

    ringerStopRef.current = () => {
      stopped = true;
      audio.pause();
      audio.removeEventListener("error", startSynth);
      audio.src = "";
      ringtoneRef.current = null;
      if (synthInterval) clearInterval(synthInterval);
      ctx?.close().catch(() => {});
      try { navigator.vibrate?.(0); } catch { /* noop */ }
    };
  }, []);

  const stopRinging = useCallback(() => {
    ringerStopRef.current?.();
    ringerStopRef.current = null;
  }, []);

  useEffect(() => {
    if (callState === "incoming" || callState === "outgoing") startRinging();
    else stopRinging();
  }, [callState, startRinging, stopRinging]);

  useEffect(() => () => stopRinging(), [stopRinging]);

  // ---------- Media ----------
  const getMedia = useCallback(async (kind: CallKind): Promise<MediaStream | null> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Las llamadas requieren HTTPS o localhost (contexto seguro).");
      return null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: kind === "video" ? { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } : false,
      });
      setLocalStream(stream);
      localStreamRef.current = stream;
      setMuted(false);
      setCameraOff(false);
      return stream;
    } catch (err: any) {
      if (err?.name === "NotAllowedError" || err?.name === "SecurityError") {
        toast.error(
          (kind === "video" ? "Permiso de cámara/micrófono denegado." : "Permiso de micrófono denegado.") +
            " Si lo rechazaste antes, actívalo en Ajustes del sistema → Apps → Forward_Chat → Permisos.",
          { duration: 9000 }
        );
      } else if (err?.name === "NotFoundError") {
        toast.error(kind === "video" ? "No se encontró cámara o micrófono." : "No se encontró micrófono.");
      } else {
        toast.error("No se pudo acceder al hardware de audio/video.");
      }
      return null;
    }
  }, []);

  const stopLocal = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    localStreamRef.current = null;
    setLocalStream(null);
  }, []);

  // ---------- Dispositivos (selección de mic/cámara/altavoz) ----------
  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setMics(all.filter((d) => d.kind === "audioinput" && d.deviceId));
      setCams(all.filter((d) => d.kind === "videoinput" && d.deviceId));
      setSpeakers(all.filter((d) => d.kind === "audiooutput" && d.deviceId));
      // Reflejar los dispositivos realmente en uso
      const audioTrack = localStreamRef.current?.getAudioTracks()[0];
      const videoTrack = localStreamRef.current?.getVideoTracks()[0];
      if (audioTrack) setMicId(audioTrack.getSettings().deviceId || null);
      if (videoTrack) setCamId(videoTrack.getSettings().deviceId || null);
    } catch { /* permisos aún no concedidos */ }
  }, []);

  /** Reemplaza la pista local (audio o video) en el stream y en todos los peers. */
  const replaceLocalTrack = useCallback(async (kind: "audio" | "video", constraints: MediaTrackConstraints) => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const fresh = await navigator.mediaDevices.getUserMedia(
      kind === "audio"
        ? { audio: { echoCancellation: true, noiseSuppression: true, ...constraints } }
        : { video: { width: { ideal: 640 }, height: { ideal: 480 }, ...constraints } }
    );
    const newTrack = kind === "audio" ? fresh.getAudioTracks()[0] : fresh.getVideoTracks()[0];
    if (!newTrack) return;
    // Respetar mute/cámara apagada del usuario
    newTrack.enabled = kind === "audio" ? !mutedRef.current : !cameraOffRef.current;
    const old = kind === "audio" ? stream.getAudioTracks() : stream.getVideoTracks();
    await Promise.all(
      Array.from(pcsRef.current.values()).map((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === kind);
        return sender ? sender.replaceTrack(newTrack).catch(() => {}) : Promise.resolve();
      })
    );
    old.forEach((tr) => {
      tr.stop();
      stream.removeTrack(tr);
    });
    stream.addTrack(newTrack);
    // Descartar pistas extra que getUserMedia haya abierto
    fresh.getTracks().forEach((tr) => {
      if (tr !== newTrack) tr.stop();
    });
    // Nuevo objeto de estado para que la UI re-renderice la vista previa
    setLocalStream(stream);
    if (kind === "audio") setMicId(newTrack.getSettings().deviceId || null);
    else setCamId(newTrack.getSettings().deviceId || null);
  }, []);

  const setMic = useCallback(async (deviceId: string) => {
    try {
      await replaceLocalTrack("audio", { deviceId: { exact: deviceId } });
      toast.success("Micrófono cambiado");
    } catch {
      toast.error("No se pudo cambiar el micrófono");
    }
  }, [replaceLocalTrack]);

  const setCam = useCallback(async (deviceId: string) => {
    try {
      await replaceLocalTrack("video", { deviceId: { exact: deviceId } });
      toast.success("Cámara cambiada");
    } catch {
      toast.error("No se pudo cambiar la cámara");
    }
  }, [replaceLocalTrack]);

  const setSpeaker = useCallback((deviceId: string) => {
    setSpeakerId(deviceId);
  }, []);

  const cycleCamera = useCallback(async () => {
    const list = cams;
    if (list.length < 2) return;
    const current = localStreamRef.current?.getVideoTracks()[0]?.getSettings().deviceId;
    const idx = list.findIndex((d) => d.deviceId === current);
    const next = list[(idx + 1) % list.length];
    await setCam(next.deviceId);
  }, [cams, setCam]);

  // ---------- Peers ----------
  const removePeer = useCallback((peerId: string) => {
    const pc = pcsRef.current.get(peerId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
      pcsRef.current.delete(peerId);
    }
    const timer = reconnectTimersRef.current.get(peerId);
    if (timer) {
      clearTimeout(timer);
      reconnectTimersRef.current.delete(peerId);
    }
    pendingIceRef.current.delete(peerId);
    setRemoteStreams((prev) => {
      if (!(peerId in prev)) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  const fullCleanup = useCallback(() => {
    if (outgoingTimerRef.current) {
      clearTimeout(outgoingTimerRef.current);
      outgoingTimerRef.current = null;
    }
    Array.from(pcsRef.current.keys()).forEach(removePeer);
    reconnectTimersRef.current.forEach((t) => clearTimeout(t));
    reconnectTimersRef.current.clear();
    stopLocal();
    setRemoteStreams({});
    setIncoming(null);
    setCallScope(null);
    setCallState("idle");
    setMuted(false);
    setCameraOff(false);
    setCallQuality(null);
    setCallRtt(null);
  }, [removePeer, stopLocal]);

  /** Renegociación con ICE restart: recupera la llamada tras un cambio de red. */
  const attemptIceRestart = useCallback(async (peerId: string) => {
    const pc = pcsRef.current.get(peerId);
    if (!pc || !socket) return;
    try {
      setCallQuality("reconnecting");
      const channel = callScopeRef.current === "lobby" ? "lobby" : null;
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      socket.emit("call-offer", { to: peerId, offer, kind: callKindRef.current, channel, restart: true });
    } catch { /* el peer pudo haberse cerrado */ }
  }, [socket]);

  const createPeer = useCallback((peerId: string, channel: string | null) => {
    removePeer(peerId); // nunca duplicar conexiones con el mismo peer
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcsRef.current.set(peerId, pc);

    localStreamRef.current?.getTracks().forEach((tr) => pc.addTrack(tr, localStreamRef.current!));

    pc.onicecandidate = (e) => {
      if (e.candidate && socket) {
        socket.emit("ice-candidate", { to: peerId, candidate: e.candidate.toJSON(), channel });
      }
    };
    pc.ontrack = (e) => {
      const stream = e.streams[0] || new MediaStream([e.track]);
      setRemoteStreams((prev) => ({ ...prev, [peerId]: stream }));
    };
    const clearReconnectTimer = () => {
      const timer = reconnectTimersRef.current.get(peerId);
      if (timer) {
        clearTimeout(timer);
        reconnectTimersRef.current.delete(peerId);
      }
    };
    let connectedOnce = false;
    pc.oniceconnectionstatechange = () => {
      if (import.meta.env.DEV) console.log(`[rtc] ${peerId} ICE: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        clearReconnectTimer();
        setCallQuality((q) => (q === "reconnecting" ? "good" : q));
        if (!connectedOnce) {
          connectedOnce = true;
          toast.success("Audio conectado");
        } else {
          toast.success("Llamada recuperada");
        }
      } else if (pc.iceConnectionState === "disconnected") {
        // Transitorio en redes móviles: dar 3.5s antes de forzar ICE restart
        setCallQuality("reconnecting");
        clearReconnectTimer();
        reconnectTimersRef.current.set(
          peerId,
          window.setTimeout(() => {
            if (["disconnected", "failed"].includes(pc.iceConnectionState)) attemptIceRestart(peerId);
          }, 3500)
        );
      } else if (pc.iceConnectionState === "failed") {
        clearReconnectTimer();
        if (connectedOnce) {
          toast.info("Conexión interrumpida; intentando recuperar la llamada...");
          attemptIceRestart(peerId);
          // Si en 12s no se recuperó, terminar limpio (nunca dejar la UI colgada)
          reconnectTimersRef.current.set(
            peerId,
            window.setTimeout(() => {
              if (!["connected", "completed"].includes(pc.iceConnectionState)) {
                removePeer(peerId);
                if (callScopeRef.current === peerId) {
                  toast.error("No se pudo recuperar la llamada.");
                  fullCleanup();
                }
              }
            }, 12000)
          );
        } else {
          toast.error("La red bloquea la conexión de audio. Se necesita un servidor TURN (VITE_TURN_URLS).");
          try { (pc as any).restartIce?.(); } catch { /* navegador viejo */ }
        }
      }
    };
    pc.onconnectionstatechange = () => {
      if (import.meta.env.DEV) console.log(`[rtc] ${peerId} conn: ${pc.connectionState}`);
      // "disconnected"/"failed" se manejan arriba con ICE restart; solo
      // "closed" es definitivo.
      if (pc.connectionState === "closed") {
        removePeer(peerId);
        // En DM 1:1 la caída del peer termina la llamada
        if (callScopeRef.current === peerId) {
          toast.info("Llamada finalizada.");
          fullCleanup();
        }
      }
    };
    return pc;
  }, [socket, removePeer, fullCleanup, attemptIceRestart]);

  const flushPendingIce = useCallback(async (peerId: string) => {
    const pc = pcsRef.current.get(peerId);
    const pending = pendingIceRef.current.get(peerId) || [];
    pendingIceRef.current.delete(peerId);
    for (const cand of pending) {
      try { await pc?.addIceCandidate(new RTCIceCandidate(cand)); } catch { /* peer cerrado */ }
    }
  }, []);

  // ---------- Acciones públicas ----------
  const startCall = useCallback(async (peerId: string, kind: CallKind) => {
    if (!socket || callStateRef.current !== "idle") return;
    if (!checkPerms(kind)) return;
    const stream = await getMedia(kind);
    if (!stream) return;
    setCallKind(kind);
    setCallScope(peerId);
    setCallState("outgoing");
    const pc = createPeer(peerId, null);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("call-offer", { to: peerId, offer, kind });
    outgoingTimerRef.current = window.setTimeout(() => {
      if (callStateRef.current === "outgoing") {
        socket.emit("call-end", { to: peerId });
        toast.info("Nadie contestó la llamada.");
        fullCleanup();
      }
    }, CALL_TIMEOUT_MS);
  }, [socket, getMedia, createPeer, fullCleanup, checkPerms]);

  const acceptCall = useCallback(async () => {
    const inc = incomingRef.current;
    if (!socket || !inc) return;
    // Permiso desactivado: interceptar SIN rechazar (el usuario puede activarlo y aceptar)
    if (!checkPerms(inc.kind)) return;
    const stream = await getMedia(inc.kind);
    if (!stream) {
      socket.emit("call-reject", { to: inc.from, reason: "media" });
      setIncoming(null);
      setCallState("idle");
      return;
    }
    setCallKind(inc.kind);
    setCallScope(inc.from);
    setIncoming(null);
    const pc = createPeer(inc.from, null);
    await pc.setRemoteDescription(new RTCSessionDescription(inc.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("call-answer", { to: inc.from, answer });
    await flushPendingIce(inc.from);
    setCallState("active");
  }, [socket, getMedia, createPeer, flushPendingIce, checkPerms]);

  const rejectCall = useCallback(() => {
    const inc = incomingRef.current;
    if (socket && inc) socket.emit("call-reject", { to: inc.from, reason: "rejected" });
    setIncoming(null);
    if (callStateRef.current === "incoming") setCallState("idle");
  }, [socket]);

  const hangUp = useCallback(() => {
    const scope = callScopeRef.current;
    if (socket && scope) {
      if (scope === "lobby") socket.emit("leave-voice", { channel: "lobby" });
      else socket.emit("call-end", { to: scope });
    }
    fullCleanup();
  }, [socket, fullCleanup]);

  const joinVoice = useCallback(async (kind: CallKind) => {
    if (!socket || callStateRef.current !== "idle") return;
    if (!checkPerms(kind)) return;
    const stream = await getMedia(kind);
    if (!stream) return;
    setCallKind(kind);
    setCallScope("lobby");
    setCallState("active");
    socket.emit("join-voice", { channel: "lobby", video: kind === "video" });
  }, [socket, getMedia, checkPerms]);

  const toggleMute = useCallback(() => {
    const tracks = localStreamRef.current?.getAudioTracks() || [];
    const nextMuted = !muted;
    tracks.forEach((tr) => (tr.enabled = !nextMuted));
    setMuted(nextMuted);
  }, [muted]);

  const toggleCamera = useCallback(() => {
    const tracks = localStreamRef.current?.getVideoTracks() || [];
    if (tracks.length === 0) return;
    const nextOff = !cameraOff;
    tracks.forEach((tr) => (tr.enabled = !nextOff));
    setCameraOff(nextOff);
    if (callScopeRef.current === "lobby") {
      socket?.emit("voice-state", { channel: "lobby", video: !nextOff });
    }
  }, [cameraOff, socket]);

  // ---------- Listeners de señalización ----------
  useEffect(() => {
    if (!socket) return;

    const onOffer = async (payload: any) => {
      if (!payload?.from || !payload?.offer) return;

      // Renegociación (ICE restart) de una llamada ya existente: responder
      // en silencio, sin tocar el estado de la UI.
      if (payload.restart && pcsRef.current.has(payload.from)) {
        const pc = pcsRef.current.get(payload.from)!;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("call-answer", { to: payload.from, answer, channel: payload.channel || null, restart: true });
          await flushPendingIce(payload.from);
        } catch { /* peer cerrado a medio camino */ }
        return;
      }

      // Oferta de malla del lobby: auto-aceptar solo si estoy en el canal de voz
      if (payload.channel === "lobby") {
        if (callScopeRef.current !== "lobby") return;
        const pc = createPeer(payload.from, "lobby");
        await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("call-answer", { to: payload.from, answer, channel: "lobby" });
        await flushPendingIce(payload.from);
        return;
      }

      // DM: si estoy ocupado, rechazar como "busy"
      if (callStateRef.current !== "idle") {
        socket.emit("call-reject", { to: payload.from, reason: "busy" });
        return;
      }
      setIncoming({
        from: payload.from,
        fromName: payload.fromName || payload.from,
        kind: payload.kind === "video" ? "video" : "audio",
        offer: payload.offer,
      });
      setCallState("incoming");
      toast.info(`${payload.fromName || "Alguien"} te está llamando...`, { duration: 8000 });
    };

    const onAnswer = async (payload: any) => {
      if (!payload?.from || !payload?.answer) return;
      const pc = pcsRef.current.get(payload.from);
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
        await flushPendingIce(payload.from);
      } catch { return; }
      if (!payload.channel && callStateRef.current === "outgoing") {
        if (outgoingTimerRef.current) {
          clearTimeout(outgoingTimerRef.current);
          outgoingTimerRef.current = null;
        }
        setCallState("active");
      }
    };

    const onIce = async (payload: any) => {
      if (!payload?.from || !payload?.candidate) return;
      const pc = pcsRef.current.get(payload.from);
      if (pc && pc.remoteDescription) {
        try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch { /* ignorar */ }
      } else {
        // Llegó antes que la oferta/respuesta: encolar
        const queue = pendingIceRef.current.get(payload.from) || [];
        queue.push(payload.candidate);
        pendingIceRef.current.set(payload.from, queue);
      }
    };

    const onReject = (payload: any) => {
      if (callScopeRef.current !== payload?.from) return;
      const name = payload?.fromName || "El usuario";
      toast.info(
        payload?.reason === "busy" ? `${name} está en otra llamada.`
        : payload?.reason === "offline" ? `${name} no está conectado ahora mismo.`
        : payload?.reason === "blocked" ? "Necesitan ser amigos para llamarse."
        : "Llamada rechazada."
      );
      fullCleanup();
    };

    const onEnd = (payload: any) => {
      if (!payload?.from) return;
      if (callScopeRef.current === payload.from) {
        toast.info("Llamada finalizada.");
        fullCleanup();
      } else if (incomingRef.current?.from === payload.from) {
        setIncoming(null);
        if (callStateRef.current === "incoming") setCallState("idle");
        toast.info("Llamada perdida");
      } else {
        removePeer(payload.from);
      }
    };

    // Soy el recién llegado al canal de voz: ofrecer a los miembros existentes
    const onVoiceMembers = async (payload: any) => {
      if (payload?.channel !== "lobby" || callScopeRef.current !== "lobby") return;
      for (const peerId of payload.members || []) {
        if (peerId === selfId) continue;
        const pc = createPeer(peerId, "lobby");
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("call-offer", { to: peerId, offer, kind: callKindRef.current, channel: "lobby" });
      }
    };

    const onVoiceParticipants = (payload: any) => {
      if (payload?.channel !== "lobby") return;
      const members: VoiceMember[] = payload.members || [];
      setVoiceMembers(members);
      if (callScopeRef.current === "lobby") {
        // Limpiar peers de quienes salieron del canal
        const ids = new Set(members.map((m) => m.userId));
        Array.from(pcsRef.current.keys()).forEach((peerId) => {
          if (!ids.has(peerId)) removePeer(peerId);
        });
      }
    };

    socket.on("call-offer", onOffer);
    socket.on("call-answer", onAnswer);
    socket.on("ice-candidate", onIce);
    socket.on("call-reject", onReject);
    socket.on("call-end", onEnd);
    socket.on("voice members", onVoiceMembers);
    socket.on("voice participants", onVoiceParticipants);

    return () => {
      socket.off("call-offer", onOffer);
      socket.off("call-answer", onAnswer);
      socket.off("ice-candidate", onIce);
      socket.off("call-reject", onReject);
      socket.off("call-end", onEnd);
      socket.off("voice members", onVoiceMembers);
      socket.off("voice participants", onVoiceParticipants);
    };
  }, [socket, selfId, createPeer, flushPendingIce, fullCleanup, removePeer]);

  // ---------- Calidad de llamada (getStats: RTT + pérdida de paquetes) ----------
  useEffect(() => {
    if (callState !== "active") return;
    setCallQuality((q) => q ?? "good");
    let prevLost = 0;
    let prevReceived = 0;
    const interval = window.setInterval(async () => {
      const pc = pcsRef.current.values().next().value as RTCPeerConnection | undefined;
      if (!pc || !["connected", "completed"].includes(pc.iceConnectionState)) return;
      try {
        const stats = await pc.getStats();
        let rtt: number | null = null;
        let lost = 0;
        let received = 0;
        stats.forEach((report) => {
          if (report.type === "candidate-pair" && (report.nominated || report.selected) && report.state === "succeeded") {
            if (typeof report.currentRoundTripTime === "number") rtt = Math.round(report.currentRoundTripTime * 1000);
          }
          if (report.type === "inbound-rtp" && !report.isRemote) {
            lost += report.packetsLost || 0;
            received += report.packetsReceived || 0;
          }
        });
        const dLost = Math.max(0, lost - prevLost);
        const dReceived = Math.max(0, received - prevReceived);
        prevLost = lost;
        prevReceived = received;
        const lossRatio = dLost + dReceived > 0 ? dLost / (dLost + dReceived) : 0;
        setCallRtt(rtt);
        setCallQuality((q) => {
          if (q === "reconnecting") return q;
          if ((rtt !== null && rtt > 400) || lossRatio > 0.08) return "poor";
          if ((rtt !== null && rtt > 180) || lossRatio > 0.03) return "fair";
          return "good";
        });
      } catch { /* stats no disponibles */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [callState]);

  // ---------- Lista de dispositivos (al entrar a llamada y al conectar hardware) ----------
  useEffect(() => {
    if (callState !== "active" && callState !== "outgoing") return;
    refreshDevices();
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    md.addEventListener("devicechange", refreshDevices);
    return () => md.removeEventListener("devicechange", refreshDevices);
  }, [callState, refreshDevices]);

  // Colgar limpio al cerrar pestaña o desmontar
  useEffect(() => {
    const bye = () => {
      if (callScopeRef.current === "lobby") socket?.emit("leave-voice", { channel: "lobby" });
      else if (callScopeRef.current) socket?.emit("call-end", { to: callScopeRef.current });
    };
    window.addEventListener("beforeunload", bye);
    return () => {
      window.removeEventListener("beforeunload", bye);
      bye();
      Array.from(pcsRef.current.keys()).forEach((id) => pcsRef.current.get(id)?.close());
      localStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  return {
    callState,
    callKind,
    callScope,
    incoming,
    localStream,
    remoteStreams,
    voiceMembers,
    muted,
    cameraOff,
    mics,
    cams,
    speakers,
    micId,
    camId,
    speakerId,
    callQuality,
    callRtt,
    startCall,
    acceptCall,
    rejectCall,
    hangUp,
    joinVoice,
    toggleMute,
    toggleCamera,
    setMic,
    setCam,
    setSpeaker,
    cycleCamera,
  };
}
