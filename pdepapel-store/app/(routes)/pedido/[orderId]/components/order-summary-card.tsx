"use client";

import { CalendarCheck, Lock, Printer, Receipt } from "lucide-react";

import { BankTransferInstructions } from "@/components/bank-transfer-instructions";
import { BoldCheckoutButton } from "@/components/bold-checkout-button";
import { Button } from "@/components/ui/button";
import { Currency } from "@/components/ui/currency";
import { OrderStatus, PaymentMethod } from "@/constants";
import { amountDueNow, depositBalance, depositPaidSoFar, isDepositOrder } from "@/lib/presale-checkout";
import { depositPendingText, depositProgressText } from "@/lib/presale-copy";
import { currencyFormatter } from "@/lib/utils";
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
  const codFee = order.shipping?.isCOD ? Number(order.shipping?.codFee ?? 0) : 0;
  const discount = Number(order.discount ?? 0);
  const couponDiscount = Number(order.couponDiscount ?? 0);
  const giftCardAmount = Number(order.giftCardAmount ?? 0);
  const digital = order.type === "GIFT_CARD";
  // Lo que se pagó por fuera de la tarjeta; el total del pedido no cambia.
  const amountDue = Math.max(0, order.total - giftCardAmount);
  const canCollectPayment = awaitingPayment && stage.stage !== "cancelled";
  // Preventa con anticipo: el total es el del producto; hoy se cobra el anticipo.
  const deposit = isDepositOrder(order) ? Number(order.depositAmount ?? 0) : 0;
  const depositReceived = deposit > 0 && order.status === OrderStatus.DEPOSIT_PAID;
  const paidSoFar = depositPaidSoFar(order);
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
          {deposit > 0
            ? // Un intento rechazado conserva su explicación («No se hizo ningún cargo…»).
              order.paymentResult === "declined"
              ? `${stage.description} ${depositPendingText(deposit)}.`
              : `${depositPendingText(deposit)}.`
            : stage.description}
        </div>
      )}

      {depositReceived && (
        <div
          role="status"
          data-testid="deposit-paid-card"
          className="flex flex-col gap-1.5 rounded-xl border border-kawaii-mint bg-kawaii-mint-light/60 p-3 text-sm text-emerald-950"
        >
          <p className="flex items-center gap-2 font-sans text-base font-bold">
            <CalendarCheck aria-hidden="true" className="h-4 w-4 shrink-0" />
            Preventa apartada
          </p>
          <p className="font-semibold" data-testid="deposit-progress">
            {depositProgressText(paidSoFar, depositBalance(order))}
          </p>
          <p>Te escribimos cuando llegue el producto para coordinar el pago y el envío.</p>
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
        {!digital && (
          <Row label={order.shipping?.provider === "NONE" ? "Retiro en tienda" : "Envío"}>
            {deposit > 0 && shippingCost === 0 ? (
              <span className="text-sm font-semibold text-muted-foreground">Se cotiza cuando llegue</span>
            ) : shippingCost > 0 ? (
              <Currency value={shippingCost} className="text-sm font-semibold" />
            ) : (
              <span className="text-sm font-semibold text-success">Gratis</span>
            )}
          </Row>
        )}
        {!digital && codFee > 0 && (
          <Row label="Recaudo contra entrega">
            <Currency value={codFee} className="text-sm font-semibold" />
          </Row>
        )}
        <div className="border-t border-dashed border-border pt-2">
          {deposit > 0 ? (
            <Row label="Total del producto">
              <Currency value={order.total} className="text-sm font-semibold" />
            </Row>
          ) : (
            <Row label={giftCardAmount > 0 ? "Total del pedido" : totalLabel} strong={giftCardAmount === 0}>
              <Currency value={order.total} className={giftCardAmount > 0 ? "text-sm font-semibold" : "text-2xl font-bold text-pink-froly"} />
            </Row>
          )}
        </div>
        {deposit > 0 && (
          <>
            <Row
              label={
                stage.stage === "cancelled"
                  ? "Anticipo"
                  : depositReceived
                    ? "Pagado hasta ahora"
                    : stage.stage === "paid" || stage.stage === "shipped" || stage.stage === "delivered"
                      ? "Anticipo pagado"
                      : "Anticipo a pagar hoy"
              }
              strong
            >
              <Currency value={depositReceived ? paidSoFar : deposit} className="text-2xl font-bold text-pink-froly" />
            </Row>
            {order.status !== OrderStatus.PAID && stage.stage !== "cancelled" && (
              <Row label="Saldo al llegar">
                <span className="text-sm font-semibold">{currencyFormatter.format(depositBalance(order))} + envío</span>
              </Row>
            )}
          </>
        )}
        {giftCardAmount > 0 && (
          <>
            <Row label="Tarjeta de regalo">
              <Currency value={giftCardAmount} isNegative className="text-sm font-semibold text-success" />
            </Row>
            <div className="border-t border-dashed border-border pt-2">
              <Row label={amountDue === 0 ? "Pagado con la tarjeta" : totalLabel} strong>
                <Currency value={amountDue === 0 ? giftCardAmount : amountDue} className="text-2xl font-bold text-pink-froly" />
              </Row>
            </div>
          </>
        )}
      </dl>

      <dl className="flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
        <Row label="Método de pago">
          <span className="font-semibold">{getPaymentMethodLabel(method)}</span>
        </Row>
        {order.orderNumber && (
          <Row label="Referencia">
            <span className="select-all font-quicksand text-xs font-semibold">
              {order.orderNumber}
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
          order={{ id: order.id, orderNumber: order.orderNumber, total: amountDueNow(order) }}
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
            status: order.status,
            paymentPlan: order.paymentPlan,
            depositAmount: order.depositAmount,
            giftCardAmount: order.giftCardAmount,
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
