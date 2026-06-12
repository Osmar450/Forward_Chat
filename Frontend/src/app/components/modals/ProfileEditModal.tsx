import React, { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Camera, Check, Copy, KeyRound, Palette, Pencil, Pipette, Sparkles, User, X } from "lucide-react";
import type { ThemeTokens } from "../../lib/themes";
import { BANNER_COLORS, BANNER_GRADIENT_CSS, BANNER_GRADIENT_KEY, Participant, STATUSES, Status, USER_COLORS } from "../../lib/chat";
import { CloseButton } from "../common/CloseButton";

type Props = {
  open: boolean;
  me: Participant;
  theme: ThemeTokens;
  friendCode: string;
  bannerStyleFor: (p: Participant | null | undefined) => React.CSSProperties;
  updateMe: (patch: Partial<Participant>) => void;
  onPickAvatar: (file: File) => void;
  onPickBanner: (file: File) => void;
  onCopyCode: () => void;
  onClose: () => void;
};

/** Editor del perfil propio: banner, avatar, colores, nombre, bio y estado. */
export function ProfileEditModal(props: Props) {
  // La tarjeta interna se monta fresca en cada apertura para que
  // los campos temporales (nombre/bio) partan del perfil actual.
  return <AnimatePresence>{props.open && <ProfileEditCard {...props} />}</AnimatePresence>;
}

function ProfileEditCard({
  me,
  theme: t,
  friendCode,
  bannerStyleFor,
  updateMe,
  onPickAvatar,
  onPickBanner,
  onCopyCode,
  onClose,
}: Props) {
  const [tempName, setTempName] = useState(me.name);
  const [tempBio, setTempBio] = useState(me.bio || "");
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const save = () => {
    const finalName = tempName.trim() || me.name || "anónimo";
    updateMe({ name: finalName, bio: tempBio.trim() });
    onClose();
    toast.success("Perfil guardado");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-sm ${t.panel} border ${t.borderStrong} rounded-2xl shadow-2xl max-h-[90dvh] overflow-y-auto overflow-x-hidden`}
      >
        {/* ---- Editor de banner ---- */}
        <div className="relative h-28 group" style={bannerStyleFor(me)}>
          {me.banner && <img src={me.banner} alt="" className="size-full object-cover" />}
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onPickBanner(f);
            }}
          />
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => bannerInputRef.current?.click()}
              className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur text-white text-xs flex items-center gap-1.5 shadow-lg"
            >
              <Camera className="size-3.5" />
              Foto
            </motion.button>
            {(me.banner || me.bannerColor) && (
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => updateMe({ banner: null, bannerColor: null })}
                className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur text-white text-xs flex items-center gap-1.5 shadow-lg"
              >
                <X className="size-3.5" />
                Quitar
              </motion.button>
            )}
          </div>
          <div className="absolute top-3 right-3">
            <CloseButton onClick={onClose} className="bg-black/40 hover:bg-black/60 text-white shadow-md" size="small" />
          </div>
        </div>

        <div className="px-6 pb-6">
          {/* Avatar sobre el banner */}
          <div className="flex items-end justify-between -mt-10 mb-3">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) onPickAvatar(f);
              }}
            />
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => avatarInputRef.current?.click()}
              className="relative group/avatar"
            >
              <div
                className="size-20 rounded-full flex items-center justify-center text-white text-3xl overflow-hidden border-4 shadow-xl"
                style={{ backgroundColor: me.color, borderColor: t.accentHex }}
              >
                {me.avatar ? <img src={me.avatar} alt="avatar" className="size-full object-cover" /> : me.name.charAt(0).toUpperCase()}
              </div>
              <div className={`absolute -bottom-1 -right-1 size-8 rounded-full ${t.accent} flex items-center justify-center shadow-lg border-2 border-black/20`}>
                <Camera className="size-3.5 text-white" />
              </div>
            </motion.button>
            <div className="flex items-center gap-2 pb-1">
              <Pencil className={`size-4 ${t.accentText}`} />
              <span className="text-sm">Editar Perfil</span>
            </div>
          </div>

          {/* ---- Color del banner ---- */}
          <label className={`text-xs ${t.textMuted} flex items-center gap-1 mb-1.5`}>
            <Palette className="size-3" /> COLOR DEL BANNER
          </label>
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            {BANNER_COLORS.map((c) => {
              const active = !me.banner && me.bannerColor?.toLowerCase() === c.toLowerCase();
              return (
                <motion.button
                  key={c}
                  whileHover={{ scale: 1.2, y: -2 }}
                  whileTap={{ scale: 0.85 }}
                  onClick={() => updateMe({ bannerColor: c, banner: null })}
                  className={`size-7 rounded-lg shadow-md ${active ? "ring-2 ring-offset-1 ring-offset-transparent" : ""}`}
                  style={{ backgroundColor: c, boxShadow: active ? `0 0 0 2px ${c}` : undefined }}
                  aria-label={`Color de banner ${c}`}
                >
                  {active && <Check className="size-4 text-white mx-auto" strokeWidth={3} />}
                </motion.button>
              );
            })}
            <label
              className="relative size-7 rounded-lg shadow-md cursor-pointer overflow-hidden flex items-center justify-center ring-1 ring-black/10"
              title="Elegir un color personalizado"
              style={{ background: "conic-gradient(from 180deg, #ef4444, #f59e0b, #84cc16, #22d3ee, #3b82f6, #a855f7, #ef4444)" }}
            >
              <Pipette className="size-3.5 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]" />
              <input
                type="color"
                value={me.bannerColor && me.bannerColor !== BANNER_GRADIENT_KEY ? me.bannerColor : me.color || "#7c5cff"}
                onChange={(e) => updateMe({ bannerColor: e.target.value, banner: null })}
                className="absolute inset-0 size-full opacity-0 cursor-pointer"
              />
            </label>
            {/* Degradado multicolor: siempre la última opción */}
            <motion.button
              whileHover={{ scale: 1.2, y: -2 }}
              whileTap={{ scale: 0.85 }}
              onClick={() => updateMe({ bannerColor: BANNER_GRADIENT_KEY, banner: null })}
              className={`size-7 rounded-lg shadow-md ${!me.banner && me.bannerColor === BANNER_GRADIENT_KEY ? "ring-2 ring-offset-1 ring-offset-transparent ring-white/80" : ""}`}
              style={{ background: BANNER_GRADIENT_CSS }}
              aria-label="Banner degradado multicolor"
              title="Degradado multicolor"
            >
              {!me.banner && me.bannerColor === BANNER_GRADIENT_KEY && <Check className="size-4 text-white mx-auto" strokeWidth={3} />}
            </motion.button>
          </div>

          {/* ---- Color de usuario ---- */}
          <label className={`text-xs ${t.textMuted} flex items-center gap-1 mb-1.5`}>
            <Palette className="size-3" /> TU COLOR
          </label>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {USER_COLORS.map((c) => {
              const active = me.color.toLowerCase() === c.toLowerCase();
              return (
                <motion.button
                  key={c}
                  whileHover={{ scale: 1.2, y: -2 }}
                  whileTap={{ scale: 0.85 }}
                  onClick={() => updateMe({ color: c })}
                  className={`size-6 rounded-full shadow-md ${active ? "ring-2 ring-offset-2 ring-offset-transparent" : ""}`}
                  style={{ backgroundColor: c, boxShadow: active ? `0 0 0 2px ${c}` : undefined }}
                  aria-label={`Color ${c}`}
                >
                  {active && <Check className="size-3.5 text-white mx-auto" strokeWidth={3} />}
                </motion.button>
              );
            })}
            <label
              className="relative size-6 rounded-full shadow-md cursor-pointer overflow-hidden flex items-center justify-center ring-1 ring-black/10"
              title="Elegir un color personalizado"
              style={{ background: "conic-gradient(from 180deg, #ef4444, #f59e0b, #84cc16, #22d3ee, #3b82f6, #a855f7, #ef4444)" }}
            >
              <Pipette className="size-3 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]" />
              <input
                type="color"
                value={me.color || "#7c5cff"}
                onChange={(e) => updateMe({ color: e.target.value })}
                className="absolute inset-0 size-full opacity-0 cursor-pointer"
              />
            </label>
          </div>

          {/* ---- Nombre ---- */}
          <label className={`text-xs ${t.textMuted} flex items-center gap-1 mb-1.5`}>
            <User className="size-3" /> NOMBRE
          </label>
          <div className="relative mb-4">
            <input
              value={tempName}
              onChange={(e) => setTempName(e.target.value.slice(0, 30))}
              placeholder="Tu nombre"
              className={`w-full ${t.inputBg} border ${t.border} rounded-xl px-4 py-3 pr-10 outline-none ${t.text} focus:border-current transition-colors`}
            />
            <Pencil className={`absolute right-3 top-1/2 -translate-y-1/2 size-4 ${t.textMuted}`} />
          </div>

          {/* ---- Bio ---- */}
          <label className={`text-xs ${t.textMuted} flex items-center gap-1 mb-1.5`}>
            <Sparkles className="size-3" /> SOBRE MÍ
          </label>
          <div className="relative mb-1">
            <textarea
              value={tempBio}
              onChange={(e) => setTempBio(e.target.value.slice(0, 200))}
              placeholder="Cuéntale al mundo quién eres..."
              rows={2}
              className={`w-full ${t.inputBg} border ${t.border} rounded-xl px-4 py-3 outline-none ${t.text} resize-none focus:border-current transition-colors`}
            />
          </div>
          <div className={`text-[10px] ${t.textMuted} text-right mb-3`}>{tempBio.length}/200</div>

          {/* ---- Estado ---- */}
          <label className={`text-xs ${t.textMuted} flex items-center gap-1 mb-1.5`}>
            <Sparkles className="size-3" /> ESTADO
          </label>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {(["online", "idle", "dnd", "invisible"] as Status[]).map((s) => {
              const S = STATUSES[s];
              const Icon = S.icon;
              const active = me.status === s;
              return (
                <motion.button
                  key={s}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => updateMe({ status: s })}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-colors ${
                    active ? `${t.borderStrong} ${t.accentSoft}` : `${t.border} ${t.inputBg}`
                  }`}
                >
                  <Icon className={`size-4 ${S.color}`} fill={s === "online" || s === "dnd" ? "currentColor" : "none"} />
                  <span className="text-sm">{S.label}</span>
                  {active && <Check className={`size-3.5 ml-auto ${t.accentText}`} />}
                </motion.button>
              );
            })}
          </div>

          {/* ---- Forward Token ---- */}
          <label className={`text-xs ${t.textMuted} flex items-center gap-1 mb-1.5`}>
            <KeyRound className="size-3" /> TU FORWARD TOKEN
          </label>
          <button
            onClick={onCopyCode}
            className={`w-full mb-6 flex items-center justify-between gap-2 px-4 py-3 rounded-xl ${t.inputBg} border ${t.border} hover:opacity-80 transition-opacity`}
          >
            <span className="font-pixel-ui tracking-widest text-sm">{friendCode || "Conectando..."}</span>
            <Copy className={`size-4 ${t.textMuted}`} />
          </button>

          <div className="grid grid-cols-2 gap-3">
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.95 }} onClick={onClose} className={`py-3 rounded-xl ${t.iconBtn}`}>
              Cancelar
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              onClick={save}
              className={`py-3 rounded-xl text-white ${t.accent} ${t.accentHover} shadow-lg flex items-center justify-center gap-2`}
            >
              <Check className="size-4" />
              Guardar
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
