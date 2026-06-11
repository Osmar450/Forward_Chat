import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Phone, PhoneOff, Video } from "lucide-react";
import type { ThemeTokens } from "../../lib/themes";
import type { Participant } from "../../lib/chat";
import type { WebRTCApi } from "../../hooks/useWebRTC";

export function IncomingCallModal({
  rtc,
  participants,
  theme: t,
}: {
  rtc: WebRTCApi;
  participants: Record<string, Participant>;
  theme: ThemeTokens;
}) {
  const inc = rtc.incoming;
  const caller = inc ? participants[inc.from] : null;

  return (
    <AnimatePresence>
      {inc && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.85, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.85, y: 30, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
            className={`w-full max-w-xs ${t.panel} border ${t.borderStrong} rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center`}
          >
            {/* Avatar con anillos de "ring" */}
            <div className="relative mb-4">
              <motion.span
                animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
                className={`absolute inset-0 rounded-full ${t.accent}`}
              />
              <motion.span
                animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut", delay: 0.4 }}
                className={`absolute inset-0 rounded-full ${t.accent}`}
              />
              <div
                className="relative size-20 rounded-full flex items-center justify-center text-white text-3xl overflow-hidden border-4 shadow-xl"
                style={{ backgroundColor: caller?.color || t.accentHex, borderColor: t.accentHex }}
              >
                {caller?.avatar ? (
                  <img src={caller.avatar} alt="" className="size-full object-cover" />
                ) : (
                  (inc.fromName || "?").charAt(0).toUpperCase()
                )}
              </div>
            </div>

            <div className="font-display text-base mb-1 truncate max-w-full">{inc.fromName}</div>
            <div className={`text-xs ${t.textMuted} flex items-center gap-1.5 mb-6`}>
              {inc.kind === "video" ? <Video className="size-3.5" /> : <Phone className="size-3.5" />}
              {inc.kind === "video" ? "Videollamada entrante" : "Llamada de voz entrante"}
              <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity }}>...</motion.span>
            </div>

            <div className="flex items-center justify-center gap-8 w-full">
              <div className="flex flex-col items-center gap-1.5">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={rtc.rejectCall}
                  className="size-14 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg shadow-red-500/30"
                  aria-label="Rechazar llamada"
                >
                  <PhoneOff className="size-6" />
                </motion.button>
                <span className={`text-[10px] ${t.textMuted}`}>Rechazar</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                  onClick={rtc.acceptCall}
                  className="size-14 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30"
                  aria-label="Aceptar llamada"
                >
                  {inc.kind === "video" ? <Video className="size-6" /> : <Phone className="size-6" />}
                </motion.button>
                <span className={`text-[10px] ${t.textMuted}`}>Aceptar</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
