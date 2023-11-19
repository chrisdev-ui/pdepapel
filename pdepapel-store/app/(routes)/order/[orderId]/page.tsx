import { getOrder } from "@/actions/get-order";
import dynamic from "next/dynamic";

const SingleOrderPage = dynamic(
  () => import("./components/single-order-page"),
  { ssr: false },
);

export const revalidate = 0;

export default async function OrderPage({
  params,
}: {
  params: { orderId: string };
}) {
  const order = await getOrder(params.orderId);

  return <SingleOrderPage order={order} />;
}
