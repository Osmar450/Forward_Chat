import { AnimatePresence, motion } from "motion/react";
import { Heart, ThumbsUp, Laugh, Frown, Flame, Angry, Plus } from "lucide-react";

export type ReactionKey = "heart" | "thumb" | "laugh" | "sad" | "fire" | "angry";
export type Reaction = { kind: "icon"; key: ReactionKey } | { kind: "emoji"; char: string };

const PREDEFINED_REACTIONS = [
  { key: "heart", icon: Heart, color: "text-red-500", label: "Me encanta" },
  { key: "thumb", icon: ThumbsUp, color: "text-blue-500", label: "Me gusta" },
  { key: "laugh", icon: Laugh, color: "text-yellow-400", label: "Divertido" },
  { key: "sad", icon: Frown, color: "text-cyan-400", label: "Triste" },
  { key: "fire", icon: Flame, color: "text-orange-500", label: "Genial" },
  { key: "angry", icon: Angry, color: "text-red-600", label: "Enojado" },
] as const;

interface ReactionPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (reaction: Reaction) => void;
  position?: "top" | "bottom";
  currentReactions?: Reaction[];
}

export function ReactionPicker({
  isOpen,
  onClose,
  onSelect,
  position = "top",
  currentReactions = [],
}: ReactionPickerProps) {
  const handleAddEmoji = () => {
    onClose();
    const char = window.prompt("Escribe o pega un emoji:");
    if (!char) return;
    const trimmed = char.trim();
    if (!trimmed) return;
    onSelect({ kind: "emoji", char: Array.from(trimmed)[0] });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Capa 1: backdrop a pantalla completa que cierra al tocar fuera */}
          <div
            className="fixed inset-0 z-[9998]"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            onTouchStart={(e) => e.stopPropagation()}
          />

          {/* Capa 2: píldora flotante (fondo oscuro, borde morado) */}
          <motion.div
            initial={{ opacity: 0, y: position === "top" ? 10 : -10, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: position === "top" ? 10 : -10, scale: 0.85 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className={`absolute ${position === "top" ? "bottom-full mb-2" : "top-full mt-2"} left-1/2 -translate-x-1/2 z-[9999] pointer-events-auto bg-[#13111C] border border-purple-500/60 rounded-full px-3 py-2 flex items-center gap-2 shadow-2xl backdrop-blur-md`}
          >
            {PREDEFINED_REACTIONS.map((r, i) => {
              const Icon = r.icon;
              const isActive = currentReactions.some((x) => x.kind === "icon" && x.key === r.key);
              return (
                <motion.button
                  key={r.key}
                  initial={{ opacity: 0, y: 8, scale: 0.5 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: i * 0.04, type: "spring", stiffness: 400, damping: 18 }}
                  whileHover={{ scale: 1.4, y: -4 }}
                  whileTap={{ scale: 0.85 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect({ kind: "icon", key: r.key });
                    onClose();
                  }}
                  className={`p-1.5 rounded-full transition-colors ${isActive ? "bg-white/20" : "hover:bg-white/10"}`}
                  title={r.label}
                  aria-label={r.label}
                >
                  <Icon className={`size-5 ${r.color}`} strokeWidth={1.5} />
                </motion.button>
              );
            })}

            <motion.button
              initial={{ opacity: 0, y: 8, scale: 0.5 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: PREDEFINED_REACTIONS.length * 0.04, type: "spring", stiffness: 400, damping: 18 }}
              whileHover={{ scale: 1.4, y: -4, rotate: 90 }}
              whileTap={{ scale: 0.85 }}
              onClick={(e) => {
                e.stopPropagation();
                handleAddEmoji();
              }}
              className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-purple-300 ml-1 transition-colors"
              title="Añadir emoji"
              aria-label="Añadir emoji"
            >
              <Plus className="size-5" strokeWidth={1.5} />
            </motion.button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
