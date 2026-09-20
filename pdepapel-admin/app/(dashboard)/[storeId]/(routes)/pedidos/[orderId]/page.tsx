import { getDaneLocations } from "@/actions/get-dane-locations";
import { buildOrderTimeline, getNextStepCard } from "@/lib/order-timeline";
import { getShippingChargeState } from "@/lib/order-totals";
import prismadb from "@/lib/prismadb";
import { getStoreAccess } from "@/lib/store-access";
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
  // La lista de clientas anteriores trae nombre, correo, teléfono y documento:
  // solo sirve para rellenar el pedido y solo la puede pedir la dueña. Se
  // consulta el acceso antes, en vez de dejar que el guardia reviente dentro
  // del `Promise.all` y se lleve por delante la página del pedido.
  const access = await getStoreAccess(params.storeId);
  const canWrite = access?.role === "owner";
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
    canWrite ? getAvailableCustomers(params.storeId) : Promise.resolve([]),
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
          nextStep={
            order
              ? getNextStepCard(
                  {
                    ...order,
                    openInventoryIssues: order.inventoryIssues.length,
                  },
                  params.storeId,
                )
              : null
          }
          timeline={
            order
              ? buildOrderTimeline({
                  ...order,
                  openInventoryIssues: order.inventoryIssues.length,
                })
              : []
          }
          shippingInfo={
            order?.shipping ? (
              <ShippingInfo
                shipping={order.shipping}
                freeShipping={freeShipping}
              />
            ) : null
          }
        />
      </div>
    </div>
  );
}
