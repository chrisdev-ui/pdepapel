import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export default function NotFound() {
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
          404
        </h1>
        <h2 className="mt-6 text-center font-serif text-3xl font-extrabold text-pink-froly">
          !Página no encontrada!
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          La página que estás buscando pudo haber sido removida, su nombre ha
          cambiado, está temporalmente no disponible o no existe.
          <br />
          <br />
          <Link href="/">
            <Button className="bg-pink-froly font-serif font-semibold">
              Ir al inicio
            </Button>
          </Link>
        </p>
      </div>
    </Container>
  );
}
