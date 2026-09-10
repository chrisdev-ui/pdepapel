"use client";

import { Lock, Printer, Receipt } from "lucide-react";

import { BankTransferInstructions } from "@/components/bank-transfer-instructions";
import { BoldCheckoutButton } from "@/components/bold-checkout-button";
import { Button } from "@/components/ui/button";
import { Currency } from "@/components/ui/currency";
import { PaymentMethod } from "@/constants";
import { getPaymentMethodLabel, type OrderStageInfo } from "@/lib/order-status";
import type { Order } from "@/types";
import { OrderSection } from "./order-section";

interface OrderSummaryCardProps {
  order: Order;
  stage: OrderStageInfo;
  awaitingPayment: boolean;
  autoOpenPayment: boolean;
  isStartingWompi: boolean;
  onPayWithWompi: () => void;
}

function Row({
  label,
  children,
  strong,
}: {
  label: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <dt className={strong ? "font-sans text-base font-bold text-blue-yankees" : "text-muted-foreground"}>
        {label}
      </dt>
      <dd className="m-0">{children}</dd>
    </div>
  );
}

export function OrderSummaryCard({
  order,
  stage,
  awaitingPayment,
  autoOpenPayment,
  isStartingWompi,
  onPayWithWompi,
}: OrderSummaryCardProps) {
  const method = order.payment?.method;
  const shippingCost = Number(order.shipping?.cost ?? 0);
  const discount = Number(order.discount ?? 0);
  const couponDiscount = Number(order.couponDiscount ?? 0);
  const canCollectPayment = awaitingPayment && stage.stage !== "cancelled";
  const totalLabel =
    stage.stage === "paid" ||
    stage.stage === "shipped" ||
    stage.stage === "delivered" ||
    stage.stage === "issue"
      ? "Total pagado"
      : stage.stage === "cod"
        ? "Total a pagar al recibir"
        : "Total";

  return (
    <OrderSection
      id="pedido-resumen"
      title="Resumen"
      icon={Receipt}
      tint="bg-kawaii-mint-light"
    >
      {canCollectPayment && (
        <div
          role="status"
          className="rounded-xl border border-kawaii-yellow bg-kawaii-yellow-light/60 p-3 text-sm text-yellow-950"
        >
          {stage.description}
        </div>
      )}

      <dl className="flex flex-col gap-2">
        <Row label="Subtotal">
          <Currency value={order.subtotal} className="text-sm font-semibold" />
        </Row>
        {discount > 0 && (
          <Row label="Descuento">
            <Currency value={discount} isNegative className="text-sm font-semibold text-success" />
          </Row>
        )}
        {couponDiscount > 0 && (
          <Row label={order.coupon?.code ? `Cupón ${order.coupon.code}` : "Cupón"}>
            <Currency value={couponDiscount} isNegative className="text-sm font-semibold text-success" />
          </Row>
        )}
        <Row label={order.shipping?.provider === "NONE" ? "Retiro en tienda" : "Envío"}>
          {shippingCost > 0 ? (
            <Currency value={shippingCost} className="text-sm font-semibold" />
          ) : (
            <span className="text-sm font-semibold text-success">Gratis</span>
          )}
        </Row>
        <div className="border-t border-dashed border-border pt-2">
          <Row label={totalLabel} strong>
            <Currency value={order.total} className="text-2xl font-bold text-pink-froly" />
          </Row>
        </div>
      </dl>

      <dl className="flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
        <Row label="Método de pago">
          <span className="font-semibold">{getPaymentMethodLabel(method)}</span>
        </Row>
        {order.payment?.transactionId && (
          <Row label="Referencia">
            <span className="select-all font-quicksand text-xs font-semibold">
              {order.payment.transactionId}
            </span>
          </Row>
        )}
        {order.email && (
          <Row label="Confirmación enviada a">
            <span className="break-all font-semibold">{order.email}</span>
          </Row>
        )}
      </dl>

      {canCollectPayment && (method === PaymentMethod.Bold || (method as string) === "Bold") && (
        <BoldCheckoutButton
          order={{ id: order.id, orderNumber: order.orderNumber, total: order.total }}
          autoOpen={autoOpenPayment}
        />
      )}

      {canCollectPayment && method === PaymentMethod.Wompi && (
        <Button
          type="button"
          className="w-full gap-2 rounded-full font-sans font-bold"
          disabled={isStartingWompi}
          onClick={onPayWithWompi}
        >
          <Lock aria-hidden="true" className="h-4 w-4" />
          {isStartingWompi ? "Preparando el pago…" : "Pagar ahora"}
        </Button>
      )}

      {canCollectPayment && method === PaymentMethod.BankTransfer && (
        <BankTransferInstructions
          order={{
            id: order.id,
            orderNumber: order.orderNumber,
            total: order.total,
            fullName: order.fullName,
          }}
        />
      )}

      <Button
        type="button"
        variant="outline"
        onClick={() => window.print()}
        className="w-full gap-2 rounded-full border-[1.5px] border-blue-yankees font-sans font-semibold text-blue-yankees print:hidden"
      >
        <Printer aria-hidden="true" className="h-4 w-4" />
        Imprimir o guardar recibo
      </Button>
      <p className="text-xs text-muted-foreground print:hidden">
        Es un recibo de compra, no una factura electrónica. Si necesitas
        factura, pídela por WhatsApp con tu NIT o cédula.
      </p>
    </OrderSection>
  );
}
