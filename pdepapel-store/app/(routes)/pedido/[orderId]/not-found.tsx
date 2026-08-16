import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { STOREFRONT_ROUTES } from "@/lib/routes";

export default function OrderNotFound() {
  return (
    <Container className="flex min-h-[50vh] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <section className="w-full max-w-xl space-y-5 rounded-2xl border bg-card p-8 text-center shadow-sm">
        <p className="font-serif text-sm font-semibold uppercase tracking-wide text-pink-froly">
          Pedido no disponible
        </p>
        <h1 className="font-serif text-3xl font-extrabold">
          Orden no encontrada
        </h1>
        <p className="text-muted-foreground">
          Revisa el enlace o el número recibido por correo. Si necesitas ayuda,
          escríbenos y con gusto la revisamos contigo.
        </p>
        <Button asChild>
          <Link href={STOREFRONT_ROUTES.shop}>Ver la tienda</Link>
        </Button>
      </section>
    </Container>
  );
}
