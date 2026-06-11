import { AnimatePresence, motion } from "motion/react";
import { Send } from "lucide-react";
import type { ThemeTokens } from "../../lib/themes";
import { CloseButton } from "../common/CloseButton";

export type PendingImage = { file: File; previewUrl: string; caption: string };

/** Vista previa a pantalla completa de una imagen antes de enviarla, con pie de foto. */
export function ImagePreviewModal({
  pendingImage,
  theme: t,
  onChangeCaption,
  onSend,
  onClose,
}: {
  pendingImage: PendingImage | null;
  theme: ThemeTokens;
  onChangeCaption: (caption: string) => void;
  onSend: () => void;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {pendingImage && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <CloseButton onClick={onClose} className="bg-white/10 hover:bg-white/20 text-white" />
            <span className="font-pixel-ui text-xs tracking-widest opacity-80">VISTA PREVIA</span>
            <div className="size-9" />
          </div>

          <div className="flex-1 flex items-center justify-center px-4 overflow-hidden">
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 280, damping: 24 }}
              src={pendingImage.previewUrl}
              alt="preview"
              className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
            />
          </div>

          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 26, delay: 0.1 }}
            className="p-3 flex items-center gap-2"
          >
            <input
              autoFocus
              value={pendingImage.caption}
              onChange={(e) => onChangeCaption(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSend()}
              placeholder="Añade un comentario..."
              className="flex-1 bg-white/10 text-white placeholder-white/50 border border-white/20 rounded-full px-4 py-3 outline-none min-w-0"
            />
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.85, rotate: -25 }}
              onClick={onSend}
              style={{ background: `linear-gradient(135deg, ${t.accentHex}, ${t.accentHex}cc)` }}
              className="shrink-0 size-12 rounded-full flex items-center justify-center text-white shadow-lg"
              aria-label="Enviar imagen"
            >
              <Send className="size-5 -translate-x-px" fill="currentColor" />
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
