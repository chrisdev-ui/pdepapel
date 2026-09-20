"use client";

import { Lock, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { useViewerAccess } from "@/components/shell/viewer-access";
import { Button } from "@/components/ui/button";

/**
 * Pantalla del panel que no se pudo abrir.
 *
 * Una cuenta de solo lectura llega aquí cuando entra a una pantalla reservada
 * a la dueña (costos, datos personales, proveedores, impuestos, ajustes): el
 * cargador se niega y antes eso caía en la página de error genérica, que se
 * leía como una falla del sistema. Este error.tsx vive **dentro** del armazón,
 * así que sabe el rol de la sesión y puede decir lo que de verdad pasa.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { isViewer } = useViewerAccess();

  useEffect(() => {
    console.error("[DASHBOARD_ERROR]", error);
  }, [error]);

  return (
    <section className="flex min-h-[60vh] items-center justify-center p-4 sm:p-8">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border bg-white p-8 text-center shadow-sm">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-tint-cream text-primary">
          <Lock className="h-6 w-6" aria-hidden="true" />
        </span>
        {isViewer ? (
          <>
            <h1 className="text-xl font-bold text-primary">Esta pantalla es solo para la dueña</h1>
            <p className="text-sm text-muted-foreground">
              Tu cuenta es de solo lectura y esta parte del panel muestra información reservada
              (costos, datos de clientas, proveedores o ajustes). Las pantallas que sí puedes ver
              están en el menú.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-primary">No pudimos abrir esta pantalla</h1>
            <p className="text-sm text-muted-foreground">
              Algo falló al cargar la información. Vuelve a intentarlo; si sigue pasando, avísanos
              con lo que estabas haciendo.
            </p>
          </>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {!isViewer && (
            <Button type="button" onClick={reset}>
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
              Reintentar
            </Button>
          )}
          <Button asChild variant={isViewer ? "default" : "outline"}>
            <Link href="/">Volver al inicio</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
