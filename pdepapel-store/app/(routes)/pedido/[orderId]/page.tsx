import { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { getOrder } from "@/actions/get-order";
import { orderPath } from "@/lib/routes";
import SingleOrderPage from "./components/single-order-page";

export const revalidate = 0;

// `generateMetadata` and the page run in the same request: fetch the order once.
const getOrderOnce = cache(getOrder);

export async function generateMetadata({
  params,
}: {
  params: { orderId: string };
}): Promise<Metadata> {
  const order = await getOrderOnce(params.orderId);
  if (!order) {
    return {
      title: "Pedido no encontrado",
      description:
        "No encontramos este pedido en Papelería P de Papel. Revisa el enlace del correo de confirmación o escríbenos y lo buscamos contigo.",
      alternates: {
        canonical: "/",
      },
      robots: {
        index: false,
        follow: false,
      },
    };
  }
  return {
    title: `Pedido #${order.orderNumber}`,
    description:
      "Estado, envío, guía y recibo de tu pedido en Papelería P de Papel.",
    alternates: {
      canonical: orderPath(params.orderId),
    },
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function OrderPage({
  params,
}: {
  params: { orderId: string };
}) {
  const order = await getOrderOnce(params.orderId);

  if (!order) return notFound();

  return <SingleOrderPage order={order} />;
}
