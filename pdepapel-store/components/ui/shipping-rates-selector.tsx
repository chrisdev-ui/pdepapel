import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { SHIPPINGCARRIERS } from "@/constants";
import { cn } from "@/lib/utils";
import { ShippingQuote } from "@/types";
import { Package, Truck, X } from "lucide-react";
import Image from "next/image";
import { Currency } from "./currency";

interface ShippingRatesSelectorProps {
  quotes: ShippingQuote[];
  selectedRate?: number;
  onSelect: (idRate: number) => void;
  onClear?: () => void;
  isLoading?: boolean;
  error?: string | null;
}

export const ShippingRatesSelector = ({
  quotes,
  selectedRate,
  onSelect,
  onClear,
  isLoading,
  error,
}: ShippingRatesSelectorProps) => {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!quotes || quotes.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <RadioGroup
        value={selectedRate?.toString()}
        onValueChange={(value) => onSelect(parseInt(value))}
        className="grid grid-cols-1 gap-3 md:grid-cols-2"
      >
        {quotes.map((quote) => (
          <div key={quote.idRate} className="relative">
            <RadioGroupItem
              value={quote.idRate.toString()}
              id={`rate-${quote.idRate}`}
              className="peer sr-only"
            />
            <Label
              htmlFor={`rate-${quote.idRate}`}
              className={cn(
                "flex cursor-pointer flex-col gap-3 rounded-lg border-2 border-muted bg-card p-4 transition-all hover:border-primary/50",
                "peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  {(() => {
                    const carrierInfo = SHIPPINGCARRIERS.find(
                      (c) => c.carrier === quote.carrier,
                    );
                    const bgColor = carrierInfo?.color || "#f0f0f0";

                    return carrierInfo ? (
                      <div
                        className="group/logo relative flex h-12 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-md p-2"
                        style={{ backgroundColor: bgColor }}
                      >
                        <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover/logo:translate-x-full" />
                        <Image
                          src={carrierInfo.logoUrl}
                          alt={carrierInfo.comercialName}
                          width={64}
                          height={32}
                          className="relative z-10 h-full w-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className="mt-0.5 flex-shrink-0 rounded-md bg-primary/10 p-2">
                        <Truck className="h-5 w-5 text-primary" />
                      </div>
                    );
                  })()}
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground">
                        {quote.carrier}
                      </p>
                      {quote.isCOD && (
                        <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600">
                          Pago contraentrega
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {quote.product}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Currency
                    value={quote.totalCost}
                    className="text-lg font-bold text-foreground"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Package className="h-4 w-4" />
                  <span>
                    {quote.deliveryDays} día
                    {quote.deliveryDays !== "1" && "s"}
                  </span>
                </div>
                <div className="h-4 w-px bg-border" />
                <div className="flex gap-2">
                  <span>Flete:</span>
                  <Currency value={quote.flete} className="text-sm" />
                </div>
                {quote.minimumInsurance > 0 && (
                  <>
                    <div className="h-4 w-px bg-border" />
                    <div className="flex gap-2">
                      <span>Seguro:</span>
                      <Currency
                        value={quote.minimumInsurance}
                        className="text-sm"
                      />
                    </div>
                  </>
                )}
              </div>
            </Label>
          </div>
        ))}
      </RadioGroup>
      {selectedRate && onClear ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClear}
          className="w-full"
        >
          <X className="mr-2 h-4 w-4" />
          Limpiar selección de envío
        </Button>
      ) : null}
    </div>
  );
};
