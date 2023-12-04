import { getOrder } from "@/actions/get-order";
import { Metadata } from "next";
import dynamic from "next/dynamic";

const SingleOrderPage = dynamic(
  () => import("./components/single-order-page"),
  { ssr: false },
);

export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: { orderId: string };
}): Promise<Metadata> {
  const order = await getOrder(params.orderId);
  if (!order) {
    return {
      title: "Orden no encontrada",
      description:
        "Lo sentimos, la orden que buscas no está disponible en Papelería P de Papel. Revisa tu correo electrónico para confirmar el número de tu orden. Si tienes alguna pregunta, no dudes en contactarnos. ¡Estaremos felices de ayudarte!",
      alternates: {
        canonical: "/",
      },
    };
  }
  return {
    title: `Detalle de tu orden #${order.orderNumber}`,
    description:
      "Consulta los detalles de tu orden en Papelería P de Papel. Aquí encontrarás toda la información sobre tus artículos kawaii y de oficina seleccionados, estado del pedido, y opciones de seguimiento. Comprometidos con una experiencia de compra transparente y eficiente.",
    alternates: {
      canonical: `/order/${params.orderId}`,
    },
  };
}

export default async function OrderPage({
  params,
}: {
  params: { orderId: string };
}) {
  const order = await getOrder(params.orderId);

  return <SingleOrderPage order={order} />;
}
