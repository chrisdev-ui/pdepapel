"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Falla fuera del armazón de una tienda (por ejemplo, al resolver la tienda
 * misma). Dentro de `[storeId]` hay otro `error.tsx` que sí conoce el rol de
 * la sesión y explica cuándo la pantalla es solo para la dueña.
 */
export default function DashboardGroupError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[DASHBOARD_GROUP_ERROR]", error);
  }, [error]);

  return (
    <section className="flex min-h-[60vh] items-center justify-center p-4 sm:p-8">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold text-primary">No pudimos abrir el panel</h1>
        <p className="text-sm text-muted-foreground">
          Vuelve a intentarlo; si sigue pasando, avísanos con lo que estabas haciendo.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" onClick={reset}>
            Reintentar
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Volver al inicio</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
