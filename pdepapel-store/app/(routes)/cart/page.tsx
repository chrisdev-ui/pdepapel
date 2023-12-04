import { Metadata } from "next";

import { Cart } from "./components/cart";

export const metadata: Metadata = {
  title: "Tu carrito de compras",
  description:
    "Revisa y gestiona tu selección en el carrito de Papelería P de Papel. Aquí encontrarás tus artículos kawaii y de oficina elegidos con amor, listos para ser tuyos. Fácil de modificar, actualizar y preparar para el checkout. ¡A un paso de completar tu compra con estilo!",
  alternates: {
    canonical: "/cart",
  },
};

export default function CartPage() {
  return <Cart />;
}
