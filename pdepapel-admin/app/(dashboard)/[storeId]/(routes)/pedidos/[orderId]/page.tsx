import { getDaneLocations } from "@/actions/get-dane-locations";
import { getShippingChargeState } from "@/lib/order-totals";
import prismadb from "@/lib/prismadb";
import { OrderForm } from "./components/order-form";
import { OrderWorkspaceHeader } from "./components/order-workspace-header";
import { ShippingInfo } from "./components/shipping-info";
import { getAvailableCustomers } from "./server/get-available-customers";
import { getBoxes } from "./server/get-boxes";
import { getCoupons } from "./server/get-coupons";
import { getOrder } from "./server/get-order";

export const revalidate = 0;

export default async function OrderPage({
  params,
}: {
  params: { orderId: string; storeId: string };
}) {
  const [
    { order, products, categories },
    coupons,
    users,
    locations,
    boxes,
    storeSettings,
  ] = await Promise.all([
    getOrder(params.orderId, params.storeId),
    getCoupons(params.storeId),
    getAvailableCustomers(params.storeId),
    getDaneLocations(),
    getBoxes(params.storeId),
    prismadb.store
      .findUnique({
        where: { id: params.storeId },
        select: { freeShippingThreshold: true },
      })
      .catch(() => null),
  ]);

  const freeShippingThreshold = storeSettings?.freeShippingThreshold ?? null;
  const freeShipping = order
    ? getShippingChargeState({
        shippingCost: order.shipping?.cost ?? null,
        subtotal: Number(order.subtotal) || 0,
        freeShippingThreshold,
        hasQuote: Boolean(order.shipping?.envioClickIdRate),
      }) === "free"
    : false;

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 sm:p-8 sm:pt-6">
        {order && (
          <OrderWorkspaceHeader
            storeId={params.storeId}
            order={{
              ...order,
              openInventoryIssues: order.inventoryIssues.length,
            }}
          />
        )}
        <OrderForm
          storeId={params.storeId}
          products={products}
          categories={categories}
          initialData={order}
          availableCoupons={coupons}
          users={users}
          locations={locations}
          boxes={boxes}
          freeShippingThreshold={freeShippingThreshold}
          inventoryIssues={order?.inventoryIssues ?? []}
          shippingInfo={
            order?.shipping ? (
              <ShippingInfo
                shipping={order.shipping}
                orderStatus={order.status}
                freeShipping={freeShipping}
              />
            ) : null
          }
        />
      </div>
    </div>
  );
}
