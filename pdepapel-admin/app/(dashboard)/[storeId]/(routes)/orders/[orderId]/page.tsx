import { getDaneLocations } from "@/actions/get-dane-locations";
import { clerkClient } from "@clerk/nextjs";
import { v4 as uuidv4 } from "uuid";
import { OrderForm } from "./components/order-form";
import { ShippingInfo } from "./components/shipping-info";
import { getBoxes } from "./server/get-boxes";
import { getCoupons } from "./server/get-coupons";
import { getOrder } from "./server/get-order";

export const revalidate = 0;

export default async function OrderPage({
  params,
}: {
  params: { orderId: string; storeId: string };
}) {
  const [{ order, products }, coupons, users, locations, boxes] =
    await Promise.all([
      getOrder(params.orderId, params.storeId),
      getCoupons(params.storeId),
      clerkClient.users.getUserList(),
      getDaneLocations(),
      getBoxes(params.storeId),
    ]);

  const formattedUsers = users.map((user) => ({
    value: user.id,
    label:
      user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`
        : user.emailAddresses[0]?.emailAddress || user.id,
    image: user.hasImage ? user.imageUrl : undefined,
    phone: user.phoneNumbers[0]?.phoneNumber,
    documentId: user.emailAddresses[0]?.emailAddress,
  }));

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <OrderForm
          products={products}
          initialData={order}
          availableCoupons={coupons}
          users={formattedUsers}
          locations={locations}
          boxes={boxes}
          key={uuidv4()}
        />

        {order && (
          <ShippingInfo shipping={order.shipping} orderStatus={order.status} />
        )}
      </div>
    </div>
  );
}
