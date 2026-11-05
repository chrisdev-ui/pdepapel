import { TriangleAlert } from "lucide-react";

import { CAPSULAS_SORPRESA_ID } from "@/constants";

export const CAPSULE_PRIZE_LINES_WARNING =
  "Los premios de las cápsulas no van como productos del pedido: la clienta los vería en el correo y en el recibo. Si son premios, quítalos y mándalos en la lista para registrarlos aparte.";

export const isCapsuleComboCategory = (categoryId: string | null | undefined) => categoryId === CAPSULAS_SORPRESA_ID;

/** Un combo de «Kits sorpresa» y además otra línea: puede ser una compra de verdad o un premio mal registrado. */
export function hasCapsuleComboWithOtherLines(
  items: ReadonlyArray<{ productId?: string | null }>,
  capsuleProductIds: ReadonlySet<string>,
) {
  let combo = false;
  let other = false;
  for (const item of items) {
    if (item.productId && capsuleProductIds.has(item.productId)) combo = true;
    else other = true;
  }
  return combo && other;
}

export function CapsulePrizeLinesNotice() {
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
    >
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{CAPSULE_PRIZE_LINES_WARNING}</span>
    </p>
  );
}
