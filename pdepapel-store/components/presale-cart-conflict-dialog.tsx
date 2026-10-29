"use client";

import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog";
import { useCart } from "@/hooks/use-cart";
import { useCartSheet } from "@/hooks/use-cart-sheet";
import { usePresaleCartConflict } from "@/hooks/use-presale-cart-conflict";
import { toast } from "@/hooks/use-toast";
import { getAnalyticsValue, toAnalyticsItem, trackCustomerEvent } from "@/lib/customer-analytics";
import { isDepositPresaleItem } from "@/lib/presale-deposit";

export const PRESALE_CONFLICT_KEEP_LABEL = "Mantener mi carrito";

/** Texto de la pregunta: una preventa entra a un carrito con cosas, o algo entra a un carrito con una preventa. */
export function presaleConflictCopy(productName: string, incomingIsDeposit: boolean) {
  return incomingIsDeposit
    ? {
        title: "La preventa se paga aparte",
        description: `La preventa se paga aparte. ¿Vaciar el carrito y reservar solo ${productName}?`,
        confirmLabel: "Vaciar y reservar",
      }
    : {
        title: "Tu carrito tiene una preventa",
        description: `La preventa se paga aparte. ¿Vaciar el carrito y agregar solo ${productName}?`,
        confirmLabel: "Vaciar y agregar",
      };
}

/** «Vaciar y reservar» / «Mantener mi carrito»: nunca se vacía el carrito sin preguntar. */
export function PresaleCartConflictDialog() {
  const pending = usePresaleCartConflict((state) => state.pending);
  const dismiss = usePresaleCartConflict((state) => state.dismiss);
  const openCartSheet = useCartSheet((state) => state.open);

  if (!pending) return null;
  const copy = presaleConflictCopy(pending.product.name, isDepositPresaleItem(pending.product));

  const confirm = () => {
    const cart = useCart.getState();
    cart.removeAll();
    const result = useCart.getState().addItem(pending.product, pending.quantity);
    dismiss();
    if (!result.ok) {
      toast({ description: "Este producto no está disponible en este momento.", variant: "warning" });
      return;
    }
    const item = toAnalyticsItem(pending.product, pending.quantity);
    trackCustomerEvent("add_to_cart", {
      currency: "COP",
      items: [item],
      ui_source: pending.uiSource,
      value: getAnalyticsValue([item]),
    });
    openCartSheet(result.item.id);
  };

  return (
    <ActionConfirmationDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
      onConfirm={confirm}
      title={copy.title}
      description={copy.description}
      confirmLabel={copy.confirmLabel}
      cancelLabel={PRESALE_CONFLICT_KEEP_LABEL}
    />
  );
}
