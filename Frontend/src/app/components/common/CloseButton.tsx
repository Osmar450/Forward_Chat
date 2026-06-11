import { motion } from "motion/react";
import { X } from "lucide-react";

export function CloseButton({
  onClick,
  className = "",
  size = "default",
}: {
  onClick: () => void;
  className?: string;
  size?: "default" | "small";
}) {
  const pad = size === "small" ? "p-1.5" : "p-2";
  return (
    <motion.button
      whileHover={{ rotate: 90, scale: 1.1 }}
      whileTap={{ scale: 0.85, rotate: 180 }}
      transition={{ type: "spring", stiffness: 400, damping: 18 }}
      onClick={onClick}
      aria-label="Cerrar"
      className={`${pad} rounded-lg ${className}`}
    >
      <X className="size-4" />
    </motion.button>
  );
}
