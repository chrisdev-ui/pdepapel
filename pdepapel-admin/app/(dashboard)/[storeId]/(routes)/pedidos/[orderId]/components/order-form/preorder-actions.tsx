"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PreorderPaymentDialog } from "@/components/orders/preorder-payment-dialog";
import { useCanWrite } from "@/components/shell/viewer-access";
import { Button } from "@/components/ui/button";

/**
 * Los dos botones de una preventa con anticipo en la página del pedido: el
 * anticipo mientras está pendiente y el saldo cuando ya llegó (liberada). El
 * cambio de estado genérico no los ofrece (`getAllowedTransitions`).
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
  };
}) {
  const canWrite = useCanWrite();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (!canWrite || order.paymentPlan !== "DEPOSIT") return null;

  const pending = order.status === "PENDING" || order.status === "CREATED";
  const depositPaid = order.status === "DEPOSIT_PAID";
  if (!(pending && order.presaleId) && !depositPaid) return null;

  const deposit = Math.round(Number(order.depositAmount ?? 0));
  return (
    <>
      {pending && order.presaleId ? (
        <Button type="button" className="min-h-11" onClick={() => setOpen(true)}>
          Marcar anticipo recibido
        </Button>
      ) : (
        <Button
          type="button"
          className="min-h-11"
          disabled={order.heldByPresale}
          title={order.heldByPresale ? "Primero libera la preventa: el saldo se cobra cuando llega la mercancía." : undefined}
          onClick={() => setOpen(true)}
        >
          Marcar saldo recibido
        </Button>
      )}
      {open ? (
        <PreorderPaymentDialog
          storeId={storeId}
          open={open}
          onOpenChange={setOpen}
          target={
            pending && order.presaleId
              ? { mode: "deposit", presaleId: order.presaleId, source: { kind: "order", orderId: order.id } }
              : { mode: "balance", orderId: order.id }
          }
          defaultAmount={pending ? deposit : order.balanceDue}
          defaultShippingCost={Math.round(Number(order.shippingCost ?? 0))}
          subjectLabel={`el pedido #${order.orderNumber}`}
          onDone={() => router.refresh()}
        />
      ) : null}
    </>
  );
}
