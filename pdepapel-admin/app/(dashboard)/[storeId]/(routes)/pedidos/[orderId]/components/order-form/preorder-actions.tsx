"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PreorderBalanceRequestDialog } from "@/components/orders/preorder-balance-request-dialog";
import { PreorderPaymentDialog } from "@/components/orders/preorder-payment-dialog";
import { useCanWrite } from "@/components/shell/viewer-access";
import { Button } from "@/components/ui/button";
import { currencyFormatter } from "@/lib/utils";

/**
 * Los botones de una preventa con anticipo en la página del pedido: el
 * anticipo mientras está pendiente, los abonos mientras espera la mercancía y
 * el saldo cuando ya llegó (liberada). Pagado todo antes de que llegue, se ve
 * «Saldo pagado» y al liberar el saldo es solo el envío. El cambio de estado
 * genérico no los ofrece (`getAllowedTransitions`). Ya liberada, «Pedir
 * saldo» pone el envío y deja pagar en `/pedido`; después, «Cobrar saldo»
 * muestra lo que falta y el enlace para WhatsApp.
 */
export function PreorderPaymentActions({
  storeId,
  order,
}: {
  storeId: string;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    paymentPlan?: string | null;
    depositAmount?: number | null;
    total: number;
    /** Lo que el servidor cobra de saldo con el envío actual: total − lo ya pagado. */
    balanceDue: number;
    shippingCost?: number | null;
    presaleId: string | null;
    heldByPresale: boolean;
    email?: string | null;
    fullName: string;
    productName: string;
    pickup: boolean;
    unfulfilled: boolean;
    balanceRequested: boolean;
  };
}) {
  const canWrite = useCanWrite();
  const router = useRouter();
  const [dialog, setDialog] = useState<"deposit" | "installment" | "balance" | null>(null);
  const [balanceView, setBalanceView] = useState<"request" | "collect" | null>(null);
  if (!canWrite || order.paymentPlan !== "DEPOSIT") return null;

  const pending = order.status === "PENDING" || order.status === "CREATED";
  const depositPaid = order.status === "DEPOSIT_PAID";
  if (!(pending && order.presaleId) && !depositPaid) return null;

  const deposit = Math.round(Number(order.depositAmount ?? 0));
  // Pagado todo con abonos antes de que llegue: al liberar solo falta el envío.
  const fullyPaid = depositPaid && order.balanceDue <= 0;
  const target =
    dialog === "deposit" && order.presaleId
      ? ({ mode: "deposit", presaleId: order.presaleId, source: { kind: "order", orderId: order.id } } as const)
      : dialog === "installment"
        ? ({ mode: "installment", orderId: order.id } as const)
        : ({ mode: "balance", orderId: order.id } as const);
  return (
    <>
      {pending && order.presaleId ? (
        <Button type="button" className="min-h-11" onClick={() => setDialog("deposit")}>
          Marcar anticipo recibido
        </Button>
      ) : (
        <>
          {fullyPaid ? (
            <span className="inline-flex min-h-11 items-center rounded-full bg-emerald-50 px-3 text-sm font-semibold text-emerald-800" data-testid="saldo-pagado">
              Saldo pagado
            </span>
          ) : null}
          {!order.heldByPresale && !order.unfulfilled && !order.balanceRequested ? (
            <Button type="button" className="min-h-11" onClick={() => setBalanceView("request")} data-testid="pedir-saldo">
              Pedir saldo
            </Button>
          ) : null}
          {!order.heldByPresale && order.balanceRequested && !fullyPaid ? (
            <Button type="button" className="min-h-11" onClick={() => setBalanceView("collect")} data-testid="cobrar-saldo">
              Cobrar saldo · {currencyFormatter(order.balanceDue)}
            </Button>
          ) : null}
          {order.heldByPresale && !fullyPaid ? (
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setDialog("installment")}>
              Registrar abono
            </Button>
          ) : null}
          <Button
            type="button"
            variant={order.heldByPresale ? "default" : "outline"}
            className="min-h-11"
            disabled={order.heldByPresale}
            title={order.heldByPresale ? "Primero libera la preventa: el saldo se cobra cuando llega la mercancía." : undefined}
            onClick={() => setDialog("balance")}
          >
            Marcar saldo recibido
          </Button>
        </>
      )}
      {balanceView ? (
        <PreorderBalanceRequestDialog
          storeId={storeId}
          open
          onOpenChange={(open) => !open && setBalanceView(null)}
          initialView={balanceView}
          order={{
            id: order.id,
            orderNumber: order.orderNumber,
            fullName: order.fullName,
            productName: order.productName,
            email: order.email,
            pickup: order.pickup,
            shippingCost: Math.round(Number(order.shippingCost ?? 0)),
            balanceDue: Math.max(0, order.balanceDue),
            balanceRequested: order.balanceRequested,
          }}
          onDone={() => router.refresh()}
        />
      ) : null}
      {dialog ? (
        <PreorderPaymentDialog
          storeId={storeId}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          target={target}
          defaultAmount={dialog === "deposit" ? deposit : Math.max(0, order.balanceDue)}
          defaultShippingCost={Math.round(Number(order.shippingCost ?? 0))}
          subjectLabel={`el pedido #${order.orderNumber}`}
          customerEmail={order.email}
          onDone={() => router.refresh()}
        />
      ) : null}
    </>
  );
}
