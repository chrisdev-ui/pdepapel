"use strict";

import { Button } from "@/components/ui/button";
import { FormLabel } from "@/components/ui/form";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { currencyFormatter } from "@/lib/utils";
import { Calculator, Percent } from "lucide-react";
import { useMemo, useState } from "react";
import { UseFormReturn } from "react-hook-form";

interface KitPriceCalculatorProps {
  form: UseFormReturn<any>;
}

export const KitPriceCalculator: React.FC<KitPriceCalculatorProps> = ({
  form,
}) => {
  const watchedComponents = form.watch("components");
  const components = useMemo(
    () => watchedComponents || [],
    [watchedComponents],
  );
  const [discountPercent, setDiscountPercent] = useState<number | string>(0);

  const sumOfComponents = useMemo(() => {
    return components.reduce((acc: number, item: any) => {
      return acc + (item.price || 0) * (item.quantity || 1);
    }, 0);
  }, [components]);

  const suggestedPrice = useMemo(() => {
    const discount = Number(discountPercent) || 0;
    return sumOfComponents * (1 - discount / 100);
  }, [sumOfComponents, discountPercent]);

  const onApplyPrice = () => {
    form.setValue("price", parseFloat(suggestedPrice.toFixed(2)));
  };

  return (
    <div className="col-span-3 mt-4 rounded-md border bg-indigo-50/30 p-4 dark:bg-indigo-950/10">
      <Heading
        title="Calculadora de Precio Sugerido"
        description="Calcula el precio del kit basado en la suma de sus componentes y un descuento opcional."
      />
      <Separator className="my-4" />
      <div className="grid gap-6 md:grid-cols-3">
        {/* Sum Display */}
        <div className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">
            Suma de Componentes
          </div>
          <div className="mt-2 text-2xl font-bold">
            {currencyFormatter(sumOfComponents)}
          </div>
          <div className="text-xs text-muted-foreground">
            {components.length} componentes seleccionados
          </div>
        </div>

        {/* Discount Input */}
        <div className="space-y-2">
          <FormLabel isRequired>Descuento Sugerido (%)</FormLabel>
          <div className="relative">
            <Percent className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="number"
              min="0"
              max="100"
              placeholder="0"
              className="pl-9"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Ingresa un porcentaje para calcular el precio final sugerido.
          </p>
        </div>

        {/* Suggested Price & Action */}
        <div className="flex flex-col justify-between rounded-lg border bg-card p-4 shadow-sm">
          <div>
            <div className="text-sm font-medium text-muted-foreground">
              Precio Sugerido
            </div>
            <div className="mt-2 text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {currencyFormatter(suggestedPrice)}
            </div>
          </div>

          <Button
            type="button"
            variant="default"
            size="sm"
            className="mt-3 w-full"
            onClick={onApplyPrice}
          >
            <Calculator className="mr-2 h-4 w-4" />
            Aplicar Precio
          </Button>
        </div>
      </div>
    </div>
  );
};
