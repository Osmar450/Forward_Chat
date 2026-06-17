import React, { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import type { ThemeTokens } from "../../lib/themes";
import { CloseButton } from "../common/CloseButton";

/** Barra de búsqueda dentro del chat activo, con navegación entre coincidencias. */
export function SearchBar({
  open,
  theme: t,
  query,
  matchCount,
  matchIndex,
  onChange,
  onPrev,
  onNext,
  onClose,
}: {
  open: boolean;
  theme: ThemeTokens;
  query: string;
  matchCount: number;
  matchIndex: number;
  onChange: (q: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className={`shrink-0 overflow-hidden border-b ${t.border} ${t.panel} z-20`}
        >
          <div className="flex items-center gap-2 px-3 py-2">
            <Search className={`size-4 shrink-0 ${t.accentText}`} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (e.shiftKey) onPrev();
                  else onNext();
                }
              }}
              placeholder="Buscar en la conversación..."
              aria-label="Buscar mensajes"
              className={`flex-1 min-w-0 ${t.inputBg} border ${t.border} rounded-lg px-3 py-1.5 text-sm outline-none placeholder:opacity-50 ${t.text}`}
            />
            <span className={`text-[11px] tabular-nums whitespace-nowrap ${t.textMuted}`} aria-live="polite">
              {query.trim() ? (matchCount > 0 ? `${matchIndex + 1}/${matchCount}` : "0/0") : ""}
            </span>
            <button
              onClick={onPrev}
              disabled={matchCount === 0}
              className={`p-1.5 rounded-lg ${t.iconBtn} ${matchCount === 0 ? "opacity-40" : ""}`}
              aria-label="Coincidencia anterior"
            >
              <ChevronUp className="size-4" />
            </button>
            <button
              onClick={onNext}
              disabled={matchCount === 0}
              className={`p-1.5 rounded-lg ${t.iconBtn} ${matchCount === 0 ? "opacity-40" : ""}`}
              aria-label="Coincidencia siguiente"
            >
              <ChevronDown className="size-4" />
            </button>
            <CloseButton onClick={onClose} className={`${t.iconBtn} border`} size="small" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
