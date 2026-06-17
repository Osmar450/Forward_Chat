import React from "react";
import { logger } from "../../lib/logger";

type Props = { children: React.ReactNode };
type State = { hasError: boolean };

/**
 * Error Boundary global: si un componente revienta, la app muestra una
 * pantalla amable de recuperación en lugar de quedarse en blanco.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logger.error("Error de interfaz capturado:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#0d0b1a] text-slate-100 font-mono p-6">
          <div className="max-w-sm w-full text-center border border-[#2a2152] rounded-2xl p-8 bg-[#13102a]/90 shadow-2xl">
            <div className="text-4xl mb-4" aria-hidden>:(</div>
            <h1 className="text-base mb-2">Algo salió mal</h1>
            <p className="text-sm text-slate-400 mb-6">
              Forward_Chat encontró un error inesperado. Tus mensajes y tu perfil están a salvo.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 rounded-xl bg-[#7c5cff] hover:bg-[#9277ff] text-white text-sm transition-colors"
            >
              Recargar la aplicación
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
