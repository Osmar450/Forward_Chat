import { AnimatePresence, motion } from "motion/react";
import { Image as ImageIcon, Send, Sticker } from "lucide-react";
import type { ThemeTokens } from "../../lib/themes";
import { CloseButton } from "../common/CloseButton";

export type PendingImage = { file: File; previewUrl: string; caption: string; isGif?: boolean; asSticker?: boolean };

/** Vista previa a pantalla completa de una imagen antes de enviarla, con pie de foto. */
export function ImagePreviewModal({
  pendingImage,
  theme: t,
  onChangeCaption,
  onSetSticker,
  onSend,
  onClose,
}: {
  pendingImage: PendingImage | null;
  theme: ThemeTokens;
  onChangeCaption: (caption: string) => void;
  onSetSticker: (asSticker: boolean) => void;
  onSend: () => void;
  onClose: () => void;
}) {
  const asSticker = !!pendingImage?.asSticker;
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
              className={`object-contain shadow-2xl ${asSticker ? "max-w-[60%] max-h-[50%] drop-shadow-2xl" : "max-w-full max-h-full rounded-xl"}`}
            />
          </div>

          {/* Elección rápida: enviar como foto/GIF o como sticker (sin globo) */}
          <div className="flex items-center justify-center gap-2 px-3">
            <button
              onClick={() => onSetSticker(false)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm border transition-colors ${!asSticker ? `${t.accent} text-white border-transparent` : "bg-white/10 text-white border-white/20"}`}
            >
              <ImageIcon className="size-4" /> {pendingImage.isGif ? "GIF" : "Foto"}
            </button>
            <button
              onClick={() => onSetSticker(true)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm border transition-colors ${asSticker ? `${t.accent} text-white border-transparent` : "bg-white/10 text-white border-white/20"}`}
            >
              <Sticker className="size-4" /> Sticker
            </button>
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
              disabled={asSticker}
              placeholder={asSticker ? "Los stickers se envían sin texto" : "Añade un comentario..."}
              className="flex-1 bg-white/10 text-white placeholder-white/50 border border-white/20 rounded-full px-4 py-3 outline-none min-w-0 disabled:opacity-50"
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
