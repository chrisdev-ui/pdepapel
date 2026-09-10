import { CalendarClock, PackageOpen, Undo2 } from "lucide-react";
import { Metadata } from "next";
import Link from "next/link";

import { PolicyPage, type PolicyFact, type PolicySection } from "@/components/policy/policy-page";
import { BASE_URL } from "@/constants";
import { STOREFRONT_ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Política de cambios y devoluciones",
  description:
    "Cómo pedir un cambio o una devolución en Papelería P de Papel: plazo de 5 días calendario, condiciones del producto, quién paga el envío y cómo funcionan los reembolsos.",
  alternates: {
    canonical: STOREFRONT_ROUTES.returnsPolicy,
  },
  openGraph: {
    url: `${BASE_URL}${STOREFRONT_ROUTES.returnsPolicy}`,
  },
};

const facts: PolicyFact[] = [
  {
    icon: CalendarClock,
    tint: "bg-kawaii-yellow-light",
    value: "5 días calendario",
    label: "desde la compra para avisarnos",
  },
  {
    icon: PackageOpen,
    tint: "bg-kawaii-blue-light",
    value: "Producto sin usar",
    label: "en su empaque y estado original",
  },
  {
    icon: Undo2,
    tint: "bg-kawaii-mint-light",
    value: "Errores nuestros, sin costo",
    label: "asumimos todos los envíos",
  },
];

const sections: PolicySection[] = [
  {
    id: "como-pedir-un-cambio",
    title: "Cómo pedir un cambio o una devolución",
    content: (
      <>
        <p>
          Tienes <strong>cinco (5) días calendario</strong> a partir de la fecha
          de compra para avisarnos de cualquier cambio o devolución. Escríbenos
          por WhatsApp o correo con el número de pedido, el producto y, si
          aplica, una foto del problema. Te respondemos con los pasos a seguir.
        </p>
      </>
    ),
  },
  {
    id: "condiciones",
    title: "Condiciones del producto",
    content: (
      <ul>
        <li>
          El producto debe estar en su estado original: sin abrir, sin usar y
          con su empaque completo.
        </li>
        <li>
          No aceptamos devoluciones de productos abiertos, probados o usados, ni
          de productos cuyo empaque esté dañado o muestre mal uso.
        </li>
      </ul>
    ),
  },
  {
    id: "costos-de-envio",
    title: "Quién paga el envío",
    content: (
      <ul>
        <li>
          Si el cambio o la devolución es por un error nuestro (producto
          equivocado, defectuoso o incompleto), asumimos todos los costos.
        </li>
        <li>
          Si es por decisión tuya, los costos de envío corren por tu cuenta.
        </li>
      </ul>
    ),
  },
  {
    id: "defectos-de-fabricacion",
    title: "Defectos de fabricación",
    content: (
      <p>
        Si el producto tiene un defecto de fabricación, lo cambiamos sin costo
        adicional. Envíanos una foto o un video donde se vea el defecto para
        agilizar el proceso.
      </p>
    ),
  },
  {
    id: "reembolsos",
    title: "Reembolsos",
    content: (
      <>
        <p>
          Si un producto que compraste ya no está disponible, te reembolsamos su
          valor. El tiempo en que ves el dinero depende del método de pago
          original (pago en línea o transferencia).
        </p>
        <p>
          Si te retractas de la compra, el valor queda como saldo a favor para
          usar en otros productos de la tienda.
        </p>
      </>
    ),
  },
  {
    id: "mientras-tanto",
    title: "Mientras revisamos tu caso",
    content: (
      <p>
        Puedes ver el estado de cada pedido en{" "}
        <Link href={STOREFRONT_ROUTES.myOrders}>Mis pedidos</Link>. Si el
        problema es con la entrega (paquete que no llega, dañado o incompleto),
        revisa también la{" "}
        <Link href={STOREFRONT_ROUTES.shippingPolicy}>política de envíos</Link>.
      </p>
    ),
  },
];

export default function ReturnsPolicyPage() {
  return (
    <PolicyPage
      eyebrow="Cambios y devoluciones"
      eyebrowIcon={Undo2}
      eyebrowClassName="bg-kawaii-yellow-light text-yellow-900"
      title="Cambios y devoluciones"
      lede="Queremos que quedes feliz con cada compra. Si algo no salió bien, así lo resolvemos."
      updatedAt="2026-09-09"
      facts={facts}
      sections={sections}
      contactPrompt="¿Necesitas un cambio o una devolución?"
      currentRoute={STOREFRONT_ROUTES.returnsPolicy}
    />
  );
}
