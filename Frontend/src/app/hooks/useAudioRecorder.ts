import { useRef, useState } from "react";
import { toast } from "sonner";
import { pickRecorderMimeType } from "../lib/chat";

/**
 * Grabación de notas de voz con MediaRecorder.
 * Al terminar (sin cancelar) entrega el archivo listo para subir
 * junto con su duración y una URL local de respaldo.
 */
export function useAudioRecorder(
  onFinish: (file: File, durationSec: number, localUrl: string) => void
) {
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordIntervalRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const recordSecondsRef = useRef(0);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const startRecording = async () => {
    cancelledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickRecorderMimeType();
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const duration = Math.max(recordSecondsRef.current, 1);
        recordSecondsRef.current = 0;
        setRecordSeconds(0);
        if (cancelledRef.current) return;
        const realMimeType = rec.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: realMimeType });
        const ext = realMimeType.includes("mp4") ? "m4a" : realMimeType.includes("ogg") ? "ogg" : realMimeType.includes("mpeg") ? "mp3" : "webm";
        const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: realMimeType });
        const localUrl = URL.createObjectURL(blob);
        onFinishRef.current(file, duration, localUrl);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setRecordSeconds(0);
      recordSecondsRef.current = 0;
      recordIntervalRef.current = window.setInterval(
        () =>
          setRecordSeconds((s) => {
            const next = s + 1;
            recordSecondsRef.current = next;
            return next;
          }),
        1000
      );
    } catch {
      cancelledRef.current = true;
      setRecording(false);
      toast.error("No se pudo acceder al micrófono.");
    }
  };

  const stopRecording = (cancel: boolean) => {
    cancelledRef.current = cancel;
    if (recordIntervalRef.current) {
      clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    if (cancel) {
      setRecordSeconds(0);
      recordSecondsRef.current = 0;
    }
  };

  return { recording, recordSeconds, startRecording, stopRecording };
}
