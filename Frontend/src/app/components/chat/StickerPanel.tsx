import React, { useRef } from "react";
import { motion } from "motion/react";
import { Sparkles, Star, Sticker } from "lucide-react";
import type { ThemeTokens } from "../../lib/themes";
import { CloseButton } from "../common/CloseButton";

/** Panel de stickers del composer: favoritos, colección y subida. */
export function StickerPanel({
  theme: t,
  stickers,
  favoriteStickers,
  onSend,
  onToggleFavorite,
  onUpload,
  onClose,
}: {
  theme: ThemeTokens;
  stickers: string[];
  favoriteStickers: string[];
  onSend: (url: string) => void;
  onToggleFavorite: (url: string) => void;
  onUpload: (file: File) => void;
  onClose: () => void;
}) {
  const stickerInputRef = useRef<HTMLInputElement>(null);

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 20, opacity: 0 }}
      className={`mx-3 mt-2 ${t.panel} border ${t.borderStrong} rounded-2xl shadow-2xl p-3 z-20`}
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <Sticker className={`size-4 ${t.accentText}`} />
          <span className="text-xs font-pixel-ui tracking-widest">STICKERS</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={stickerInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onUpload(f);
            }}
          />
          <button
            onClick={() => stickerInputRef.current?.click()}
            className={`p-1.5 rounded-lg ${t.iconBtn}`}
            title="Subir sticker personalizado"
          >
            <Sparkles className="size-3.5" />
          </button>
          <CloseButton onClick={onClose} className={t.iconBtn} size="small" />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
        {favoriteStickers.length > 0 && (
          <div className="col-span-4 mb-1">
            <div className={`text-[10px] ${t.textMuted} tracking-widest mb-2 flex items-center gap-1`}>
              <Star className="size-3" /> FAVORITOS
            </div>
            <div className="grid grid-cols-4 gap-2">
              {favoriteStickers.map((s, i) => (
                <motion.button
                  key={`fav-${i}`}
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => onSend(s)}
                  className="aspect-square rounded-lg overflow-hidden bg-black/5 flex items-center justify-center p-1"
                >
                  <img src={s} alt="" className="size-full object-contain" />
                </motion.button>
              ))}
            </div>
            <div className={`my-3 border-t ${t.border} opacity-50`} />
          </div>
        )}

        {stickers.map((s, i) => (
          <div key={i} className="relative group/stick aspect-square">
            <motion.button
              whileHover={{ scale: 1.08, rotate: -5 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => onSend(s)}
              className="size-full rounded-lg overflow-hidden bg-black/5 flex items-center justify-center p-1"
            >
              <img src={s} alt="" className="size-full object-contain" />
            </motion.button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(s);
              }}
              className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/40 opacity-0 group-hover/stick:opacity-100 transition-opacity"
              title={favoriteStickers.includes(s) ? "Quitar de favoritos" : "Agregar a favoritos"}
            >
              <Star className={`size-3 ${favoriteStickers.includes(s) ? "text-yellow-400 fill-yellow-400" : "text-white"}`} />
            </button>
          </div>
        ))}
        {stickers.length === 0 && (
          <div className={`col-span-4 py-8 text-center text-xs ${t.textMuted}`}>
            No tienes stickers aún. <br /> ¡Sube uno con el botón ✨!
          </div>
        )}
      </div>
    </motion.div>
  );
}
