import { motion } from "motion/react";

/** Puntos suspensivos animados para el indicador "está escribiendo..." */
export function AnimatedDots() {
  return (
    <span className="inline-flex w-4">
      <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0 }}>.</motion.span>
      <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}>.</motion.span>
      <motion.span animate={{ opacity: [0, 1, 0] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}>.</motion.span>
    </span>
  );
}
