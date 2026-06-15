import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Image as ImageIcon, Mic, Pencil, Reply, Send, Sparkles, Sticker, WandSparkles } from "lucide-react";
import type { ThemeTokens } from "../../lib/themes";
import { LOBBY, Message, Participant, messagePreview } from "../../lib/chat";
import { CloseButton } from "../common/CloseButton";
import { StickerPanel } from "./StickerPanel";
import { RecorderBar } from "./RecorderBar";

/**
 * Composer del chat: input de texto con menciones, adjuntar imagen,
 * stickers, nota de voz y vista previa de respuesta.
 */
export function Composer({
  theme: t,
  activeChat,
  activePeer,
  selfId,
  participants,
  draft,
  canSend,
  cooldownUntil,
  typingNames,
  onDraftChange,
  onKeyDown,
  onSend,
  replyingTo,
  onCancelReply,
  editingMsg,
  onSubmitEdit,
  onCancelEdit,
  quickSuggestions,
  onQuickSuggestion,
  smartReplies,
  onSmartReply,
  showStickers,
  onToggleStickers,
  onCloseStickers,
  stickers,
  favoriteStickers,
  onSendSticker,
  onToggleFavoriteSticker,
  onUploadSticker,
  recording,
  recordingPaused,
  recordSeconds,
  onStartRecording,
  onStopRecording,
  onToggleRecordingPause,
  onPickImage,
  mentionSearch,
  filteredMentions,
  mentionIndex,
  onHoverMention,
  onInsertMention,
}: {
  theme: ThemeTokens;
  activeChat: string;
  activePeer: Participant | null;
  selfId: string;
  participants: Record<string, Participant>;
  draft: string;
  canSend: boolean;
  /** Epoch ms hasta el que el envío está bloqueado por anti-flood (0 = libre) */
  cooldownUntil: number;
  typingNames: string[];
  onDraftChange: (val: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSend: () => void;
  replyingTo: Message | null;
  onCancelReply: () => void;
  editingMsg: Message | null;
  onSubmitEdit: (text: string) => void;
  onCancelEdit: () => void;
  quickSuggestions: string[];
  onQuickSuggestion: (text: string) => void;
  /** Smart Replies (IA): chips de respuesta rápida sobre el input */
  smartReplies: string[];
  onSmartReply: (text: string) => void;
  showStickers: boolean;
  onToggleStickers: () => void;
  onCloseStickers: () => void;
  stickers: string[];
  favoriteStickers: string[];
  onSendSticker: (url: string) => void;
  onToggleFavoriteSticker: (url: string) => void;
  onUploadSticker: (file: File) => void;
  recording: boolean;
  recordingPaused: boolean;
  recordSeconds: number;
  onStartRecording: () => void;
  onStopRecording: (cancel: boolean) => void;
  onToggleRecordingPause: () => void;
  onPickImage: (file: File) => void;
  mentionSearch: string | null;
  filteredMentions: Participant[];
  mentionIndex: number;
  onHoverMention: (i: number) => void;
  onInsertMention: (p: Participant) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  // Modo edición: texto local prellenado con el mensaje original
  const [editText, setEditText] = useState("");
  const isEditing = editingMsg !== null;
  useEffect(() => {
    if (editingMsg) {
      setEditText(editingMsg.text || "");
      textInputRef.current?.focus();
    }
  }, [editingMsg]);

  // Cooldown anti-flood: tick de 100ms mientras el envío esté bloqueado
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const cooldownTotalRef = useRef(1);
  useEffect(() => {
    const remaining = cooldownUntil - Date.now();
    if (remaining <= 0) {
      setCooldownLeft(0);
      return;
    }
    cooldownTotalRef.current = remaining;
    setCooldownLeft(remaining);
    const interval = window.setInterval(() => {
      const left = cooldownUntil - Date.now();
      if (left <= 0) {
        setCooldownLeft(0);
        clearInterval(interval);
      } else {
        setCooldownLeft(left);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [cooldownUntil]);
  const coolingDown = cooldownLeft > 0;

  const inputValue = isEditing ? editText : draft;
  const editChanged = isEditing && editText.trim().length > 0 && editText.trim() !== (editingMsg?.text || "");
  const sendEnabled = (isEditing ? editChanged : canSend) && !coolingDown;

  const handleSubmit = () => {
    if (coolingDown) return;
    if (isEditing) {
      if (editChanged) onSubmitEdit(editText);
      else onCancelEdit();
    } else {
      onSend();
    }
  };

  // WhatsApp-style: al escribir, los iconos periféricos se ocultan para dar
  // todo el ancho al texto; al vaciar, vuelven con una transición fluida.
  const showPeripherals = !isEditing && draft.length === 0;

  return (
    <div className={`${t.panel} border-t ${t.border} shrink-0`}>
      {/* "X está escribiendo..." justo encima de la barra de entrada */}
      <AnimatePresence>
        {typingNames.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
            aria-live="polite"
          >
            <div className={`flex items-center gap-1.5 px-4 pt-1.5 text-[11px] ${t.accentText}`}>
              <span className="flex gap-0.5">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                    className="size-1 rounded-full bg-current"
                  />
                ))}
              </span>
              {typingNames.join(", ")} {typingNames.length > 1 ? "están escribiendo" : "está escribiendo"}...
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isEditing && (
          <motion.div
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 24 }}
            className={`mx-3 mt-2 rounded-xl border ${t.borderStrong} ${t.inputBg} px-3 py-2 flex items-start gap-2`}
          >
            <Pencil className={`size-4 mt-0.5 shrink-0 ${t.accentText}`} />
            <div className="flex-1 min-w-0">
              <div className={`text-[10px] font-pixel-ui tracking-widest ${t.accentText}`}>EDITANDO MENSAJE</div>
              <div className={`text-xs truncate ${t.textMuted}`}>{editingMsg?.text}</div>
            </div>
            <CloseButton onClick={onCancelEdit} className={`${t.iconBtn} border shadow-sm`} size="small" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sugerencias rápidas para el bot */}
      <AnimatePresence>
        {!isEditing && quickSuggestions.length > 0 && !draft && !replyingTo && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="flex gap-2 px-3 pt-2 overflow-x-auto [scrollbar-width:none]"
          >
            {quickSuggestions.map((s) => (
              <button
                key={s}
                onClick={() => onQuickSuggestion(s)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${t.border} ${t.inputBg} ${t.text} text-xs hover:opacity-80 transition-opacity`}
              >
                <Sparkles className="size-3 text-purple-400" />
                {s}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Smart Replies (IA): respuestas sugeridas tras recibir un DM */}
      <AnimatePresence>
        {!isEditing && !replyingTo && !recording && smartReplies.length > 0 && !draft && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="flex gap-2 px-3 pt-2 overflow-x-auto [scrollbar-width:none]"
            aria-label="Respuestas sugeridas"
          >
            {smartReplies.map((reply) => (
              <button
                key={reply}
                onClick={() => onSmartReply(reply)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${t.borderStrong} ${t.inputBg} ${t.text} text-xs hover:opacity-80 transition-opacity shadow-sm`}
              >
                <WandSparkles className={`size-3 ${t.accentText}`} />
                {reply}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isEditing && replyingTo && (
          <motion.div
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 24 }}
            className={`mx-3 mt-2 rounded-xl border ${t.border} ${t.inputBg} px-3 py-2 flex items-start gap-2`}
          >
            <Reply className={`size-4 mt-0.5 shrink-0 ${t.accentText}`} />
            <div className="flex-1 min-w-0">
              <div className={`text-[10px] font-pixel-ui tracking-widest ${t.accentText}`}>
                RESPONDIENDO A {(replyingTo.authorId === selfId ? "TI" : (participants[replyingTo.authorId]?.name || "anónimo").toUpperCase())}
              </div>
              <div className={`text-xs truncate ${t.textMuted}`}>{messagePreview(replyingTo.kind, replyingTo.text)}</div>
            </div>
            <CloseButton onClick={onCancelReply} className={`${t.iconBtn} border shadow-sm`} size="small" />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showStickers && (
          <StickerPanel
            theme={t}
            stickers={stickers}
            favoriteStickers={favoriteStickers}
            onSend={onSendSticker}
            onToggleFavorite={onToggleFavoriteSticker}
            onUpload={onUploadSticker}
            onClose={onCloseStickers}
          />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {recording ? (
          <RecorderBar
            theme={t}
            seconds={recordSeconds}
            paused={recordingPaused}
            onTogglePause={onToggleRecordingPause}
            onCancel={() => onStopRecording(true)}
            onSend={() => onStopRecording(false)}
          />
        ) : (
          <motion.div
            key="composer"
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 10, opacity: 0 }}
            className="flex items-center gap-2 p-3"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPickImage(f);
                e.target.value = "";
              }}
            />

            <AnimatePresence initial={false}>
              {showPeripherals && (
                <motion.div
                  key="peripherals"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: "auto", opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  className="flex items-center gap-2 overflow-hidden shrink-0"
                >
                  <motion.button
                    whileHover={{ y: -2, rotate: -8 }}
                    whileTap={{ scale: 0.85, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 400, damping: 16 }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`p-2.5 rounded-xl ${t.iconBtn}`}
                    aria-label="Adjuntar imagen"
                  >
                    <ImageIcon className="size-5" />
                  </motion.button>
                  <motion.button
                    whileHover={{ y: -2, scale: 1.05 }}
                    whileTap={{ scale: 0.85 }}
                    transition={{ type: "spring", stiffness: 400, damping: 16 }}
                    onClick={onToggleStickers}
                    className={`p-2.5 rounded-xl ${showStickers ? `${t.accent} text-white` : t.iconBtn}`}
                    aria-label="Stickers"
                  >
                    <Sticker className="size-5" />
                  </motion.button>
                  <motion.button
                    whileHover={{ y: -2, scale: 1.05 }}
                    whileTap={{ scale: 0.85 }}
                    transition={{ type: "spring", stiffness: 400, damping: 16 }}
                    onClick={onStartRecording}
                    className={`p-2.5 rounded-xl ${t.iconBtn}`}
                    aria-label="Grabar audio"
                  >
                    <Mic className="size-5" />
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="flex-1 relative">
              <AnimatePresence>
                {mentionSearch !== null && filteredMentions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className={`absolute bottom-full left-0 mb-2 w-48 ${t.panel} border ${t.borderStrong} rounded-xl shadow-2xl overflow-hidden z-50`}
                  >
                    <div className={`px-3 py-2 text-[10px] font-pixel-ui tracking-widest ${t.textMuted} border-b ${t.border}`}>MENCIONAR A...</div>
                    {filteredMentions.map((p, i) => (
                      <button
                        key={p.id}
                        onClick={() => onInsertMention(p)}
                        onMouseEnter={() => onHoverMention(i)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                          i === mentionIndex ? t.accentSoft : ""
                        }`}
                      >
                        <span className="size-6 rounded-full flex items-center justify-center text-white text-[10px] overflow-hidden" style={{ backgroundColor: p.color }}>
                          {p.avatar ? <img src={p.avatar} alt="" className="size-full object-cover" /> : p.name.charAt(0).toUpperCase()}
                        </span>
                        <span className={i === mentionIndex ? t.accentText : t.text}>{p.name}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
              <input
                ref={textInputRef}
                value={inputValue}
                onChange={(e) => (isEditing ? setEditText(e.target.value) : onDraftChange(e.target.value))}
                onKeyDown={(e) => {
                  if (isEditing) {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      onCancelEdit();
                    }
                    return;
                  }
                  onKeyDown(e);
                }}
                onPaste={(e) => {
                  // GIF/imagen desde el teclado nativo o portapapeles de Android
                  const item = Array.from(e.clipboardData?.items || []).find((it) => it.type.startsWith("image/"));
                  const file = item?.getAsFile();
                  if (file) {
                    e.preventDefault();
                    onPickImage(file);
                  }
                }}
                enterKeyHint="send"
                placeholder={isEditing ? "Edita tu mensaje..." : activeChat === LOBBY ? "Escribe un mensaje..." : `Mensaje para ${activePeer?.name || "..."}`}
                aria-label={isEditing ? "Editar mensaje" : "Escribir mensaje"}
                className={`w-full ${t.inputBg} border ${isEditing ? t.borderStrong : t.border} rounded-xl px-4 py-2.5 outline-none placeholder:opacity-50 min-w-0 ${t.text}`}
              />
            </div>
            <motion.button
              whileHover={sendEnabled ? { scale: 1.1 } : {}}
              whileTap={sendEnabled ? { scale: 0.85, rotate: isEditing ? 0 : -25 } : { scale: 0.95 }}
              animate={
                coolingDown
                  ? { rotate: 0, opacity: 1 }
                  : sendEnabled
                    ? { scale: [1, 1.05, 1], boxShadow: [`0 0 0 0 ${t.accentHex}55`, `0 0 0 8px ${t.accentHex}00`, `0 0 0 0 ${t.accentHex}00`] }
                    : { rotate: isEditing ? 0 : -10, opacity: 0.5 }
              }
              transition={
                sendEnabled
                  ? { duration: 1.6, repeat: Infinity, ease: "easeOut" }
                  : { type: "spring", stiffness: 400, damping: 18 }
              }
              onClick={handleSubmit}
              disabled={coolingDown || (!sendEnabled && !isEditing)}
              style={sendEnabled ? { background: `linear-gradient(135deg, ${t.accentHex}, ${t.accentHex}cc)` } : undefined}
              className={`shrink-0 size-11 rounded-full flex items-center justify-center text-white shadow-lg ${
                sendEnabled ? "" : `${t.iconBtn} ${isEditing && !coolingDown ? "" : "cursor-not-allowed"}`
              }`}
              aria-label={
                coolingDown
                  ? `Anti-flood: podrás enviar en ${Math.ceil(cooldownLeft / 1000)} segundos`
                  : isEditing
                    ? "Guardar edición"
                    : "Enviar"
              }
            >
              {coolingDown ? (
                /* Cooldown anti-flood: contador pixel + microbarra de progreso */
                <span className="flex flex-col items-center justify-center gap-1" aria-hidden="true">
                  <span
                    className={`font-pixel leading-none ${t.accentText}`}
                    style={{ fontSize: "15px", fontVariantNumeric: "tabular-nums" }}
                  >
                    {Math.ceil(cooldownLeft / 1000)}
                  </span>
                  <span className={`block w-6 h-[3px] rounded-full overflow-hidden ${t.isLight ? "bg-black/15" : "bg-white/15"}`}>
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.min(100, Math.max(0, (cooldownLeft / cooldownTotalRef.current) * 100))}%`,
                        backgroundColor: t.accentHex,
                        transition: "width 100ms linear",
                      }}
                    />
                  </span>
                </span>
              ) : isEditing ? (
                <Check className={`size-5 ${sendEnabled ? "text-white" : t.accentText}`} />
              ) : (
                <Send className={`size-5 ${sendEnabled ? "text-white -translate-x-px" : t.accentText}`} fill={sendEnabled ? "currentColor" : "none"} />
              )}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
