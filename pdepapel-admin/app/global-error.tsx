"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="h-screen w-screen">
        <section className="h-full w-full bg-white dark:bg-gray-900">
          <div className="mx-auto max-w-screen-xl px-4 py-8 lg:px-6 lg:py-16">
            <div className="mx-auto max-w-screen-sm text-center">
              <h1 className="text-primary-600 dark:text-primary-500 mb-4 text-7xl font-extrabold tracking-tight lg:text-9xl">
                500
              </h1>
              <p className="mb-4 text-3xl font-bold tracking-tight text-gray-900 dark:text-white md:text-4xl">
                Error interno en el servidor
              </p>
              <p className="mb-4 text-lg font-light text-gray-500 dark:text-gray-400">
                Ocurrió un error interno en el servidor. Por favor, intenta
                recargar la página.
              </p>
              <Button onClick={() => reset()}>Recargar</Button>
            </div>
          </div>
        </section>
      </body>
    </html>
  );
}
