import { MessageCircle, PackageSearch } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { STOREFRONT_ROUTES } from "@/lib/routes";

const SUPPORT_WHATSAPP_URL =
  "https://wa.me/573132582293?text=" +
  encodeURIComponent("¡Hola! No encuentro mi pedido en la página. ¿Me ayudan?");

export default function OrderNotFound() {
  return (
    <Container className="flex min-h-[50vh] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <section className="flex w-full max-w-xl flex-col items-center gap-4 rounded-3xl border border-pink-shell/30 bg-white p-8 text-center shadow-[0_4px_20px_hsl(280_30%_70%/0.15)]">
        <span
          aria-hidden="true"
          className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-kawaii-yellow-light text-blue-yankees"
        >
          <PackageSearch className="h-7 w-7" />
        </span>
        <h1 className="font-serif text-3xl font-bold text-blue-yankees">
          No encontramos este pedido
        </h1>
        <p className="text-muted-foreground">
          Revisa el enlace del correo de confirmación o el número de pedido. Si
          compraste con tu cuenta, lo verás en Mis pedidos.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild className="rounded-full font-sans font-bold">
            <Link href={STOREFRONT_ROUTES.myOrders}>Ir a Mis pedidos</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="gap-2 rounded-full border-[1.5px] border-blue-yankees font-sans font-semibold text-blue-yankees"
          >
            <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
              <MessageCircle aria-hidden="true" className="h-4 w-4" />
              Escribir por WhatsApp
            </a>
          </Button>
        </div>
        <Link
          href={STOREFRONT_ROUTES.shop}
          className="text-sm font-semibold text-blue-yankees underline underline-offset-4"
        >
          Ver la tienda
        </Link>
      </section>
    </Container>
  );
}
