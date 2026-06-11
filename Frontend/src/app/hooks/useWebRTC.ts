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
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
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
  startCall: (peerId: string, kind: CallKind) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  hangUp: () => void;
  joinVoice: (kind: CallKind) => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
};

const CALL_TIMEOUT_MS = 30000;
const RINGTONE_URL = "/Sounds/Your_Line_Is_Open.mp3";

export type CallPermissions = { mic?: () => boolean; cam?: () => boolean };

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

  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
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
        toast.error(kind === "video" ? "Permiso de cámara/micrófono denegado" : "Permiso de micrófono denegado");
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
    stopLocal();
    setRemoteStreams({});
    setIncoming(null);
    setCallScope(null);
    setCallState("idle");
    setMuted(false);
    setCameraOff(false);
  }, [removePeer, stopLocal]);

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
    let connectedOnce = false;
    pc.oniceconnectionstatechange = () => {
      if (import.meta.env.DEV) console.log(`[rtc] ${peerId} ICE: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        if (!connectedOnce) {
          connectedOnce = true;
          toast.success("Audio conectado");
        }
      } else if (pc.iceConnectionState === "failed") {
        toast.error("La red bloquea la conexión de audio. Se necesita un servidor TURN (VITE_TURN_URLS).");
        try { (pc as any).restartIce?.(); } catch { /* navegador viejo */ }
      }
    };
    pc.onconnectionstatechange = () => {
      if (import.meta.env.DEV) console.log(`[rtc] ${peerId} conn: ${pc.connectionState}`);
      // "disconnected" suele ser transitorio en redes móviles (cambio de
      // antena, wifi inestable) y se recupera solo: NO terminar la llamada.
      if (["failed", "closed"].includes(pc.connectionState)) {
        removePeer(peerId);
        // En DM 1:1 la caída del peer termina la llamada
        if (callScopeRef.current === peerId) {
          toast.info("Llamada finalizada.");
          fullCleanup();
        }
      }
    };
    return pc;
  }, [socket, removePeer, fullCleanup]);

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
    startCall,
    acceptCall,
    rejectCall,
    hangUp,
    joinVoice,
    toggleMute,
    toggleCamera,
  };
}
