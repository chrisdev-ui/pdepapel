import { getOrder } from "@/actions/get-order";
import { SingleOrderPage } from "./components/single-order-page";

export const revalidate = 0;

export default async function OrderPage({
  params,
}: {
  params: { orderId: string };
}) {
  const order = await getOrder(params.orderId);

  return <SingleOrderPage order={order} />;
}
