"use client";

import { Separator } from "@/components/ui/separator";
import type { OrderTotals, ShippingChargeState } from "@/lib/order-totals";
import { currencyFormatter } from "@/lib/utils";
import { DiscountType, type Coupon } from "@prisma/client";
import { useFormContext, useWatch } from "react-hook-form";

import type { OrderFormValues } from "./schema";

interface SummaryCardProps {
  totals: OrderTotals;
  shippingChargeState: ShippingChargeState;
  shippingCost: number;
  coupon: Coupon | null;
  itemCount: number;
}

/** Resumen de dinero del pedido: siempre a la vista en la columna lateral. */
export function SummaryCard({ totals, shippingChargeState, shippingCost, coupon, itemCount }: SummaryCardProps) {
  const { control } = useFormContext<OrderFormValues>();
  const discountType = useWatch({ control, name: "discount.type" });
  const discountAmount = useWatch({ control, name: "discount.amount" });

  return (
    <section aria-labelledby="resumen-titulo" className="flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-baseline justify-between">
        <h2 id="resumen-titulo" className="text-[15px] font-bold text-primary">
          Resumen
        </h2>
        <span className="text-xs text-muted-foreground">
          {itemCount} {itemCount === 1 ? "producto" : "productos"}
        </span>
      </div>
      <dl className="flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <dt>Subtotal</dt>
          <dd>{currencyFormatter(totals.subtotal)}</dd>
        </div>
        {totals.discount > 0 && (
          <div className="flex justify-between text-destructive">
            <dt>
              Descuento
              {discountType === DiscountType.PERCENTAGE && <span className="ml-1 text-xs opacity-75">({discountAmount}%)</span>}
            </dt>
            <dd>- {currencyFormatter(totals.discount)}</dd>
          </div>
        )}
        {totals.couponDiscount > 0 && (
          <div className="flex justify-between text-success">
            <dt>
              Cupón{coupon ? ` ${coupon.code}` : ""}
              {coupon?.type === DiscountType.PERCENTAGE && <span className="ml-1 text-xs opacity-75">({coupon.amount}%)</span>}
            </dt>
            <dd>- {currencyFormatter(totals.couponDiscount)}</dd>
          </div>
        )}
        <div className="flex justify-between text-muted-foreground">
          <dt>Envío</dt>
          <dd>
            {shippingChargeState === "charged" ? `+ ${currencyFormatter(shippingCost)}` : shippingChargeState === "free" ? <span className="font-medium text-success">Gratis</span> : "Por calcular"}
          </dd>
        </div>
      </dl>
      <Separator />
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Total</span>
        <span className="text-xl font-bold text-primary">{currencyFormatter(totals.total)}</span>
      </div>
    </section>
  );
}
