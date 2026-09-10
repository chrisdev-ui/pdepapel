"use client";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ORDER_STATUS_LABELS } from "@/lib/order-transitions";
import { OrderStatus, PaymentMethod } from "@prisma/client";
import axios from "axios";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface PaymentStatusWatcherProps {
  storeId: string;
  orderId: string;
  status: OrderStatus;
  paymentMethod?: PaymentMethod | null;
  /** Con cambios sin guardar no se recarga sola: se avisa y se deja decidir. */
  isDirty: boolean;
  intervalMs?: number;
}

const ONLINE: PaymentMethod[] = [PaymentMethod.Bold, PaymentMethod.Wompi, PaymentMethod.PayU];
const WAITING: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.CREATED];

/**
 * Bold y Wompi confirman el pago por webhook, no por esta pantalla: mientras
 * el pedido espera un pago en línea, se consulta el estado real cada pocos
 * segundos y se avisa cuando cambia, para que nadie lo marque pagado a mano
 * ni se quede mirando un cobro que ya entró.
 */
export function PaymentStatusWatcher({ storeId, orderId, status, paymentMethod, isDirty, intervalMs = 10000 }: PaymentStatusWatcherProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirmed, setConfirmed] = useState<OrderStatus | null>(null);
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;

  const active = WAITING.includes(status) && Boolean(paymentMethod && ONLINE.includes(paymentMethod)) && confirmed === null;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await axios.get(`/api/${storeId}/orders/${orderId}`);
        const fresh = response.data?.status as OrderStatus | undefined;
        if (cancelled || !fresh || fresh === status) return;
        setConfirmed(fresh);
        const gateway = paymentMethod === PaymentMethod.Wompi ? "Wompi" : "Bold";
        toast({
          title: fresh === OrderStatus.PAID ? `${gateway} confirmó el pago` : `El pedido cambió a «${ORDER_STATUS_LABELS[fresh]}»`,
          description: dirtyRef.current ? "Tienes cambios sin guardar: recarga cuando estés lista." : "La página se actualizó con el estado real.",
          variant: fresh === OrderStatus.PAID ? "success" : "default",
        });
        if (!dirtyRef.current) router.refresh();
      } catch {
        // Sin red o sin sesión: se intenta en el siguiente tick.
      }
    };
    const id = window.setInterval(check, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [active, intervalMs, orderId, paymentMethod, router, status, storeId, toast]);

  if (confirmed) {
    return (
      <div className="flex flex-col gap-2 rounded-lg bg-tint-mint p-3 text-sm text-primary sm:flex-row sm:items-center sm:justify-between">
        <span className="font-semibold">Estado real: {ORDER_STATUS_LABELS[confirmed]}.</span>
        <Button type="button" size="xs" variant="outline" onClick={() => router.refresh()}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Recargar
        </Button>
      </div>
    );
  }
  if (!active) return null;
  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
      <RefreshCw className="h-3.5 w-3.5 animate-spin [animation-duration:3s]" aria-hidden="true" />
      Esperando la confirmación de {paymentMethod === PaymentMethod.Wompi ? "Wompi" : "Bold"}: se revisa cada {Math.round(intervalMs / 1000)} s.
    </p>
  );
}
