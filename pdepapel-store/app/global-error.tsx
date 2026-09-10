"use client";

import { MessageCircle, RefreshCw, Wrench } from "lucide-react";
import { useEffect } from "react";

import { caudex, fredoka, quicksand } from "@/lib/fonts";
import { getSupportWhatsAppUrl } from "@/lib/support";
import "./globals.css";

/**
 * Last-resort boundary: it replaces the whole root layout, so nothing from it
 * (header, footer, cart, query client, Clerk, toasts) can be assumed to exist
 * or work. Plain markup, utility classes and Lucide icons only; the same card
 * as components/error-state.tsx, redrawn without any shared component.
 * Recovery is a full reload: with the root layout gone, reset() would only
 * re-render into the same broken tree.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const whatsappUrl = getSupportWhatsAppUrl(
    `¡Hola! La tienda me mostró un error y no pude seguir.${error.digest ? ` Código: ${error.digest}.` : ""}`,
  );

  return (
    <html lang="es">
      <body
        className={`${caudex.variable} ${fredoka.variable} ${quicksand.variable} bg-white`}
        style={{ paddingTop: 0 }}
      >
        <main className="mx-auto flex min-h-screen w-full max-w-screen-2xl items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
          <section
            aria-labelledby="global-error-title"
            className="flex w-full max-w-xl flex-col items-center gap-4 rounded-3xl border border-pink-shell/30 bg-white p-8 text-center shadow-[0_4px_20px_hsl(280_30%_70%/0.15)]"
          >
            <span
              aria-hidden="true"
              className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-kawaii-pink-light text-blue-yankees"
            >
              <Wrench className="h-7 w-7" />
            </span>
            <h1
              id="global-error-title"
              className="text-balance font-serif text-3xl font-bold text-blue-yankees"
            >
              Algo salió mal de nuestro lado
            </h1>
            <p className="text-pretty text-muted-foreground">
              No es tu culpa. Recarga la página; si sigue fallando, escríbenos y
              lo revisamos.
            </p>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 font-sans text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <RefreshCw aria-hidden="true" className="h-4 w-4" />
                Recargar la página
              </button>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border-[1.5px] border-blue-yankees bg-white px-4 font-sans text-sm font-semibold text-blue-yankees transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <MessageCircle aria-hidden="true" className="h-4 w-4" />
                Escribir por WhatsApp
              </a>
            </div>
            <a
              href="/"
              className="text-sm font-semibold text-blue-yankees underline underline-offset-4"
            >
              Volver al inicio
            </a>
            {error.digest && (
              <p className="text-xs text-muted-foreground">
                Código para soporte:{" "}
                <span className="font-quicksand">{error.digest}</span>
              </p>
            )}
          </section>
        </main>
      </body>
    </html>
  );
}
