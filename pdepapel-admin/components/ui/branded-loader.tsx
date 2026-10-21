"use client";

import Image from "next/image";

/**
 * Cargador flotante en el centro de la pantalla, sin fondo: antes pintaba un
 * velo difuminado del tamaño de su contenedor y dejaba ver ese recuadro sobre
 * la página. No atrapa clics.
 */
export const BrandedLoader = () => {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
      <span className="sr-only">Cargando</span>
      <div className="flex flex-col items-center gap-6" aria-hidden="true">
        <div className="relative h-24 w-24">
          <Image src="/images/text-below-transparent-bg.webp" alt="" fill className="object-contain" priority unoptimized />
        </div>
        <div className="flex h-6 items-center gap-1.5">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="h-full w-1.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none"
              style={{
                animationDuration: "1s",
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
