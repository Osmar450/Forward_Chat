import React, { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Play, Pause } from "lucide-react";
import type { ThemeTokens } from "../../lib/themes";
import { fmtTime } from "../../lib/chat";

export function AudioPlayer({ url, duration, theme: t, mine }: { url: string; duration: number; theme: ThemeTokens; mine: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalSec, setTotalSec] = useState(duration || 0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!url) return;
    const audio = new Audio(url);
    audio.preload = "metadata";
    audioRef.current = audio;
    const onTime = () => {
      const total = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration || 1;
      setProgress(audio.currentTime / total);
    };
    const onMeta = () => {
      if (isFinite(audio.duration) && audio.duration > 0) setTotalSec(audio.duration);
    };
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
      audioRef.current = null;
    };
  }, [url, duration]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const total = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : totalSec || 1;
    audio.currentTime = ratio * total;
    setProgress(ratio);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 min-w-[180px]">
      <motion.button
        whileTap={{ scale: 0.85 }}
        onClick={toggle}
        className={`size-9 rounded-full ${mine ? "bg-white/20 hover:bg-white/30" : t.iconBtn} flex items-center justify-center`}
        aria-label={playing ? "Pausar" : "Reproducir"}
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4 ml-0.5" />}
      </motion.button>
      <div className="flex-1 flex items-center gap-0.5 h-6 cursor-pointer" onClick={seek} role="slider" aria-label="Progreso del audio">
        {Array.from({ length: 20 }).map((_, i) => {
          const active = i / 20 < progress;
          return (
            <motion.span
              key={i}
              animate={{ scaleY: playing ? [0.4, 1, 0.4] : (i % 3) * 0.3 + 0.4 }}
              transition={playing ? { duration: 0.5 + (i % 4) * 0.1, repeat: Infinity, delay: i * 0.03 } : { duration: 0.2 }}
              className="w-0.5 h-full rounded-full"
              style={{ backgroundColor: active ? (mine ? "rgba(255,255,255,0.95)" : t.accentHex) : mine ? "rgba(255,255,255,0.35)" : "rgba(128,128,128,0.35)" }}
            />
          );
        })}
      </div>
      <span className={`text-[10px] tabular-nums ${mine ? "text-white/80" : t.textMuted}`}>{fmtTime(totalSec)}</span>
    </div>
  );
}
