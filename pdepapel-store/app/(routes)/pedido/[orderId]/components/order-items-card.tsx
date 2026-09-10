import { ShoppingBag } from "lucide-react";
import Link from "next/link";

import { CldImage } from "@/components/ui/CldImage";
import { Currency } from "@/components/ui/currency";
import { getCustomerFacingProductOptions } from "@/lib/product-options";
import { countOrderUnits, formatUnits } from "@/lib/order-status";
import { productPath } from "@/lib/routes";
import { currencyFormatter } from "@/lib/utils";
import type { Order } from "@/types";
import { OrderSection } from "./order-section";
import { ReorderButton } from "./reorder-button";

interface OrderItemsCardProps {
  order: Order;
  /** Reordering only makes sense once the order is out of the checkout. */
  allowReorder: boolean;
}

export function OrderItemsCard({ order, allowReorder }: OrderItemsCardProps) {
  return (
    <OrderSection
      id="pedido-productos"
      title={`Productos · ${formatUnits(countOrderUnits(order))}`}
      icon={ShoppingBag}
      tint="bg-kawaii-lavender-light"
      action={
        allowReorder ? (
          <ReorderButton orderItems={order.orderItems} size="sm" />
        ) : undefined
      }
    >
      <ul className="divide-y divide-border">
        {order.orderItems.map((item) => {
          const product = item.product;
          const imageUrl =
            item.imageUrl ||
            product?.images?.find((image) => image.isMain)?.url ||
            product?.images?.[0]?.url ||
            "";
          const name = item.name || product?.name || "Producto sin nombre";
          const href = product ? productPath(product.slug || product.id) : null;
          const details = [
            product?.design?.name ? `Diseño ${product.design.name}` : null,
            product?.color?.name ? `Color ${product.color.name}` : null,
            ...(product
              ? getCustomerFacingProductOptions(product).map(
                  (option) => `${option.name} ${option.value}`,
                )
              : []),
          ].filter(Boolean);
          const unitPrice = Number(item.price) || 0;

          return (
            <li key={item.id} className="flex gap-4 py-4 first:pt-0 last:pb-0">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                {imageUrl ? (
                  <CldImage
                    src={imageUrl}
                    alt=""
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                    Sin foto
                  </span>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <h3 className="font-sans text-[15px] font-semibold leading-snug text-blue-yankees">
                  {href ? (
                    <Link href={href} className="hover:underline">
                      {name}
                    </Link>
                  ) : (
                    name
                  )}
                </h3>
                {details.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {details.join(" · ")}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  <span className="font-quicksand font-medium">
                    {currencyFormatter.format(unitPrice)}
                  </span>{" "}
                  × {item.quantity}
                  {(item.sku || product?.sku) && (
                    <span className="hidden sm:inline">
                      {" "}
                      · Ref. {item.sku || product?.sku}
                    </span>
                  )}
                </p>
              </div>
              <Currency
                value={unitPrice * item.quantity}
                className="shrink-0 text-base font-bold text-blue-yankees"
              />
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Los precios son los del momento de la compra.
        {allowReorder &&
          " «Volver a pedir» agrega estos productos al carrito con el precio de hoy."}
      </p>
    </OrderSection>
  );
}
