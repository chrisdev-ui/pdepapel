import { getDaneLocations } from "@/actions/get-dane-locations";
import { getShippingChargeState } from "@/lib/order-totals";
import prismadb from "@/lib/prismadb";
import { OrderForm } from "./components/order-form";
import { OrderWorkspaceHeader } from "./components/order-workspace-header";
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

  const formattedUsers = users;

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 sm:p-8 sm:pt-6">
        {order ? (
          <OrderWorkspaceHeader storeId={params.storeId} order={order} />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-bold tracking-tight text-primary">
                Nuevo pedido
              </h1>
              <p className="text-sm text-muted-foreground">
                Elige los productos, el cliente y cómo paga; el envío se puede
                cotizar después. Nada se descuenta hasta marcarlo pagado.
              </p>
            </div>
            <nav
              aria-label="Pasos del pedido"
              className="flex max-w-full gap-1 self-start overflow-x-auto rounded-full border bg-white p-1 text-sm font-semibold text-primary"
            >
              {[
                ["#productos", "1. Productos"],
                ["#cliente", "2. Cliente"],
                ["#descuentos", "3. Descuentos"],
                ["#pago-seccion", "4. Pago"],
                ["#envio-seccion", "5. Envío"],
              ].map(([href, label]) => (
                <a
                  key={href}
                  href={href}
                  className="flex h-9 shrink-0 items-center rounded-full px-3.5 transition-colors hover:bg-accent"
                >
                  {label}
                </a>
              ))}
            </nav>
          </div>
        )}
        <OrderForm
          products={products}
          categories={categories}
          initialData={order}
          availableCoupons={coupons}
          users={formattedUsers}
          locations={locations}
          boxes={boxes}
          freeShippingThreshold={freeShippingThreshold}
        />

        {order && (
          <ShippingInfo
            shipping={order.shipping}
            orderStatus={order.status}
            freeShipping={freeShipping}
          />
        )}
      </div>
    </div>
  );
}
