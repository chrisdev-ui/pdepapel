"use client";

import { SuggestionStrip } from "@/components/ui/suggestion-strip";
import {
  suggestKitPrice,
  sumKitComponentRetail,
  type KitComponentLine,
} from "@/lib/kit-pricing";
import { currencyFormatter } from "@/lib/utils";
import { useMemo } from "react";

interface KitPriceSuggestionProps {
  components: KitComponentLine[];
  discountPercent: number;
  onApply: (price: number) => void;
  disabled?: boolean;
}

/**
 * Línea de sugerencia dentro de «Precio y margen». Nunca escribe el precio por
 * su cuenta: el precio solo cambia cuando se pulsa el botón.
 */
export const KitPriceSuggestion: React.FC<KitPriceSuggestionProps> = ({
  components,
  discountPercent,
  onApply,
  disabled,
}) => {
  const retail = useMemo(() => sumKitComponentRetail(components), [components]);
  const suggested = useMemo(
    () => suggestKitPrice(components, discountPercent),
    [components, discountPercent],
  );

  if (components.length === 0) {
    return (
      <p className="col-span-full text-xs text-muted-foreground">
        Agrega componentes en «Composición del kit» para calcular un precio
        sugerido.
      </p>
    );
  }

  return (
    <SuggestionStrip
      className="col-span-full"
      actionLabel={`Usar ${currencyFormatter(suggested)}`}
      disabled={disabled || suggested <= 0}
      onApply={() => onApply(suggested)}
    >
      Comprados por separado, los componentes suman{" "}
      <strong className="text-foreground">{currencyFormatter(retail)}</strong>.
      Con {Number(discountPercent) || 0} % de descuento de kit:{" "}
      <strong className="text-foreground">
        {currencyFormatter(suggested)}
      </strong>
      .
    </SuggestionStrip>
  );
};
