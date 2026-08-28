"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useProductFilters } from "@/hooks/use-product-filters";

export const OnSaleFilter = () => {
  const { filters, setFilter } = useProductFilters();

  return (
    <div className="min-h-12 md:min-h-11 flex w-full items-center rounded-lg border border-border/70 bg-muted/30 px-3 md:w-auto md:border-0 md:bg-transparent md:px-0">
      <Label
        htmlFor="on-sale-filter"
        className="min-h-11 flex min-w-0 flex-1 cursor-pointer items-center pr-3 font-sans text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 md:flex-none"
      >
        Mostrar solo ofertas
      </Label>
      <Switch
        id="on-sale-filter"
        checked={filters.isOnSale}
        onCheckedChange={(checked) => setFilter("isOnSale", checked)}
      />
    </div>
  );
};
