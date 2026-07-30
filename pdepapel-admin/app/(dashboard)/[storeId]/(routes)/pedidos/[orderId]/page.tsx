import { getDaneLocations } from "@/actions/get-dane-locations";
import { OrderForm } from "./components/order-form";
import { ShippingInfo } from "./components/shipping-info";
import { getBoxes } from "./server/get-boxes";
import { getCoupons } from "./server/get-coupons";
import { getOrder } from "./server/get-order";

import { getAvailableCustomers } from "./server/get-available-customers";

export const revalidate = 0;

export default async function OrderPage({
  params,
}: {
  params: { orderId: string; storeId: string };
}) {
  const [{ order, products, categories }, coupons, users, locations, boxes] =
    await Promise.all([
      getOrder(params.orderId, params.storeId),
      getCoupons(params.storeId),
      getAvailableCustomers(params.storeId),
      getDaneLocations(),
      getBoxes(params.storeId),
    ]);

  const formattedUsers = users;

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <OrderForm
          products={products}
          categories={categories}
          initialData={order}
          availableCoupons={coupons}
          users={formattedUsers}
          locations={locations}
          boxes={boxes}
        />

        {order && (
          <ShippingInfo shipping={order.shipping} orderStatus={order.status} />
        )}
      </div>
    </div>
  );
}
