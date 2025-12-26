"use client";

import { parseAsBoolean, useQueryState } from "nuqs";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export const OnSaleFilter = () => {
  const [isOnSale, setIsOnSale] = useQueryState(
    "isOnSale",
    parseAsBoolean.withDefault(false).withOptions({ shallow: true }),
  );

  return (
    <div className="flex items-center space-x-2 py-4">
      <Checkbox
        id="on-sale-filter"
        checked={isOnSale}
        onCheckedChange={(checked) => setIsOnSale(checked as boolean)}
        className="data-[state=checked]:border-pink-froly data-[state=checked]:bg-pink-froly"
      />
      <Label
        htmlFor="on-sale-filter"
        className="cursor-pointer font-serif text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
      >
        Mostrar solo ofertas
      </Label>
    </div>
  );
};
