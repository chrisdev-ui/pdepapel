"use client";

import { Eye } from "lucide-react";

import { useViewerAccess } from "@/components/shell/viewer-access";

/**
 * Aviso fijo en las cuentas de solo lectura. No se puede cerrar a propósito:
 * con los botones apagados y sin aviso, la pantalla parecería rota.
 */
export function ReadOnlyBanner() {
  const { isViewer } = useViewerAccess();
  if (!isViewer) return null;

  return (
    <div
      role="status"
      data-testid="read-only-banner"
      className="flex items-start gap-2 border-b border-tint-cream bg-tint-cream/60 px-4 py-2 text-sm text-primary sm:px-8"
    >
      <Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <span className="font-semibold">Solo lectura.</span> Puedes mirar el panel, pero no cambiar
        nada: los botones que crean, editan o borran están apagados. Pídele acceso a la dueña de la
        tienda si necesitas hacer algo.
      </p>
    </div>
  );
}
