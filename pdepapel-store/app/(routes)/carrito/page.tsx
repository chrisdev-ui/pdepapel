import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Container } from "@/components/ui/container";
import { STOREFRONT_ROUTES } from "@/lib/routes";

import { Metadata } from "next";
import dynamic from "next/dynamic";

const Cart = dynamic(() => import("./components/cart"), { ssr: false });

export const metadata: Metadata = {
  title: "Tu carrito de compras",
  description:
    "Revisa y gestiona tu selección en el carrito de Papelería P de Papel. Aquí encontrarás tus artículos kawaii y de oficina elegidos con amor, listos para ser tuyos. Fácil de modificar, actualizar y preparar para el checkout. ¡A un paso de completar tu compra con estilo!",
  alternates: {
    canonical: STOREFRONT_ROUTES.cart,
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function CartPage() {
  return (
    <Container className="px-4 py-8 sm:px-6 lg:px-8">
      <Breadcrumb
        items={[
          { label: "Tienda", href: STOREFRONT_ROUTES.shop },
          { label: "Carrito", isCurrent: true },
        ]}
        className="mb-6"
      />
      <Cart />
    </Container>
  );
}
