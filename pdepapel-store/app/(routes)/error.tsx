"use client";

import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Container className="flex h-full items-center justify-center">
      <div className="w-full max-w-md space-y-8 lg:py-20">
        <div className="relative mx-auto h-48 w-48">
          <Image
            src="/images/text-below-transparent-bg.webp"
            fill
            alt="Logo Papelería P de Papel con nombre debajo"
            sizes="(max-width: 640px) 100vw, 640px"
            placeholder="blur"
            priority
            className="object-cover"
            unoptimized
          />
        </div>
        <h1 className="text-center font-serif text-9xl font-black text-pink-froly">
          500
        </h1>
        <h2 className="mt-6 text-center font-serif text-3xl font-extrabold text-pink-froly">
          !Ha ocurrido un error inesperado!
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Hubo un error interno en el servidor. Por favor, recarga la página.
          <br />
          <br />
          <Button
            onClick={() => reset()}
            className="bg-pink-froly font-serif font-semibold"
          >
            Recargar
          </Button>
        </p>
      </div>
    </Container>
  );
}
