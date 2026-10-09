"use client";

import axios from "axios";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AlertModal } from "@/components/modals/alert-modal";
import { useToast } from "@/hooks/use-toast";
import { isFraudCancelled } from "@/lib/order-risk";

export function canCancelAsFraud(order: { status: string; type: string; riskReasons?: string | null }) {
  if (order.type === "POINT_OF_SALE" || order.status === "SENT") return false;
  return !(order.status === "CANCELLED" && isFraudCancelled(order));
}

export function deleteWarning(isClosedOrder: boolean) {
  return isClosedOrder
    ? "No se puede deshacer. Como ya estaba pagado o enviado, el inventario vuelve con un movimiento de cancelación."
    : "¿Seguro? Mejor usa «Cancelar como fraude/bot»: el pedido se conserva y los próximos con el mismo correo o celular salen marcados. Eliminar no se puede deshacer.";
}

/** Cancela el pedido y lo marca como fraude o bot: se conserva para que el límite y la revisión de patrones aprendan de él. */
export function CancelAsFraudDialog({
  storeId,
  order,
  open,
  onClose,
}: {
  storeId: string;
  order: { id: string; orderNumber: string };
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const onConfirm = async () => {
    setLoading(true);
    try {
      await axios.patch(`/api/${storeId}/orders`, { ids: [order.id], status: "CANCELLED", fraud: true });
      toast({ title: "Pedido cancelado como fraude", description: "Se conserva marcado y no se le escribió a la persona.", variant: "success" });
      router.refresh();
      onClose();
    } catch (error) {
      const message = axios.isAxiosError(error) ? error.response?.data?.error : null;
      toast({ title: "No se pudo cancelar", description: message || "Intenta de nuevo.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertModal
      isOpen={open}
      onClose={onClose}
      onConfirm={onConfirm}
      loading={loading}
      title={`¿Cancelar el pedido ${order.orderNumber} como fraude o bot?`}
      description="El pedido queda cancelado y marcado: no se borra, no se le escribe a la persona, no se puede pagar ni emitir una tarjeta, y los próximos pedidos con el mismo correo o celular salen marcados."
      confirmLabel="Sí, cancelar como fraude"
      destructive
    />
  );
}
