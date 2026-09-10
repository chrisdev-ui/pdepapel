"use client";

import { Button } from "@/components/ui/button";
import {
  suggestKitPrice,
  sumKitComponentRetail,
  type KitComponentLine,
} from "@/lib/kit-pricing";
import { currencyFormatter } from "@/lib/utils";
import { Calculator } from "lucide-react";
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
  const retail = useMemo(
    () => sumKitComponentRetail(components),
    [components],
  );
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
    <div className="col-span-full flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center">
      <Calculator
        className="h-4 w-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <p className="flex-1 text-xs leading-relaxed text-muted-foreground">
        Comprados por separado, los componentes suman{" "}
        <strong className="text-foreground">{currencyFormatter(retail)}</strong>.
        Con {Number(discountPercent) || 0} % de descuento de kit:{" "}
        <strong className="text-foreground">
          {currencyFormatter(suggested)}
        </strong>
        .
      </p>
      <Button
        type="button"
        variant="soft"
        size="xs"
        disabled={disabled || suggested <= 0}
        onClick={() => onApply(suggested)}
        className="shrink-0"
      >
        Usar {currencyFormatter(suggested)}
      </Button>
    </div>
  );
};
