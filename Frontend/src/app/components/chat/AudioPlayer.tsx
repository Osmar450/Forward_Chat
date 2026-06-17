import React, { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Play, Pause } from "lucide-react";
import type { ThemeTokens } from "../../lib/themes";
import { fmtTime } from "../../lib/chat";

const BAR_COUNT = 32;

// Caché de waveforms ya decodificados (evita re-decodificar al re-renderizar)
const waveformCache = new Map<string, number[]>();

/**
 * Extrae BAR_COUNT picos normalizados del audio con Web Audio API.
 * Si el navegador no puede decodificar (CORS, codec), devuelve null y la UI
 * cae con gracia a las barras animadas genéricas.
 */
async function computeWaveform(url: string): Promise<number[] | null> {
  if (waveformCache.has(url)) return waveformCache.get(url)!;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    try {
      const audio = await ctx.decodeAudioData(buf);
      const data = audio.getChannelData(0);
      const blockSize = Math.max(1, Math.floor(data.length / BAR_COUNT));
      const peaks: number[] = [];
      for (let i = 0; i < BAR_COUNT; i++) {
        let sum = 0;
        const start = i * blockSize;
        const end = Math.min(start + blockSize, data.length);
        for (let j = start; j < end; j += 16) sum += Math.abs(data[j]);
        peaks.push(sum / Math.max(1, Math.ceil((end - start) / 16)));
      }
      const max = Math.max(...peaks, 0.001);
      const normalized = peaks.map((p) => Math.max(0.12, p / max));
      waveformCache.set(url, normalized);
      return normalized;
    } finally {
      ctx.close().catch(() => {});
    }
  } catch {
    return null;
  }
}

export function AudioPlayer({ url, duration, theme: t, mine }: { url: string; duration: number; theme: ThemeTokens; mine: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalSec, setTotalSec] = useState(duration || 0);
  const [waveform, setWaveform] = useState<number[] | null>(() => waveformCache.get(url) || null);
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

  // Waveform real del audio (degrada a barras genéricas si no se puede decodificar)
  useEffect(() => {
    if (!url || waveform) return;
    let cancelled = false;
    computeWaveform(url).then((peaks) => {
      if (!cancelled && peaks) setWaveform(peaks);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

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

  const activeColor = mine ? "rgba(255,255,255,0.95)" : t.accentHex;
  const idleColor = mine ? "rgba(255,255,255,0.35)" : "rgba(128,128,128,0.35)";
  const bars = waveform || Array.from({ length: BAR_COUNT }, (_, i) => (i % 3) * 0.25 + 0.35);

  return (
    <div className="flex items-center gap-2 px-3 py-2 min-w-[200px]">
      <motion.button
        whileTap={{ scale: 0.85 }}
        onClick={toggle}
        onPointerDown={(e) => e.stopPropagation()}
        className={`size-9 shrink-0 rounded-full ${mine ? "bg-white/20 hover:bg-white/30" : t.iconBtn} flex items-center justify-center`}
        aria-label={playing ? "Pausar" : "Reproducir"}
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4 ml-0.5" />}
      </motion.button>
      <div
        className="flex-1 flex items-center gap-[2px] h-8 cursor-pointer"
        onClick={seek}
        onPointerDown={(e) => e.stopPropagation()}
        role="slider"
        aria-label="Progreso del audio"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        {bars.map((peak, i) => {
          const active = i / bars.length < progress;
          // Sin waveform real: pulso genérico mientras reproduce
          const animatedScale = waveform ? 1 : playing ? [0.5, 1, 0.5] : 1;
          return (
            <motion.span
              key={i}
              animate={{ scaleY: animatedScale }}
              transition={!waveform && playing ? { duration: 0.5 + (i % 4) * 0.1, repeat: Infinity, delay: i * 0.03 } : { duration: 0.15 }}
              className="flex-1 rounded-full"
              style={{
                height: `${Math.round(peak * 100)}%`,
                minHeight: "3px",
                backgroundColor: active ? activeColor : idleColor,
              }}
            />
          );
        })}
      </div>
      <span className={`text-[10px] tabular-nums shrink-0 ${mine ? "text-white/80" : t.textMuted}`}>{fmtTime(totalSec)}</span>
    </div>
  );
}
