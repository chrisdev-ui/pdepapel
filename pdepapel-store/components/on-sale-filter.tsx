"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useProductFilters } from "@/hooks/use-product-filters";

export const OnSaleFilter = () => {
  const { filters, setFilter } = useProductFilters();

  return (
    <div className="flex items-center space-x-2">
      <Checkbox
        id="on-sale-filter"
        checked={filters.isOnSale}
        onCheckedChange={(checked) => setFilter("isOnSale", checked === true)}
        className="data-[state=checked]:border-pink-froly data-[state=checked]:bg-pink-froly"
      />
      <Label
        htmlFor="on-sale-filter"
        className="cursor-pointer font-sans text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
      >
        Mostrar solo ofertas
      </Label>
    </div>
  );
};
