import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { SHIPPINGCARRIERS } from "@/constants";
import { GroupedShippingQuote } from "@/lib/shipping-rates";
import { cn } from "@/lib/utils";
import { Check, Clock, Truck } from "lucide-react";
import Image from "next/image";
import { Currency } from "./currency";

interface ShippingRatesSelectorProps {
  quotes: GroupedShippingQuote[];
  selectedRate?: number;
  onSelect: (idRate: number) => void;
  isLoading?: boolean;
  /** When the order already has free shipping the price is shown crossed out. */
  freeShipping?: boolean;
  disabled?: boolean;
  ariaLabelledBy?: string;
}

const formatDelivery = (days: GroupedShippingQuote["deliveryDays"]) => {
  const value = Number(days);
  if (!Number.isFinite(value)) return `${days}`;
  if (value <= 0) return "Hoy mismo";
  if (value === 1) return "Llega en 1 día hábil";
  return `Llega en ${value} días hábiles`;
};

/** «COORDINADORA» → «Coordinadora», but acronyms such as «TCC» stay as they are. */
const formatCarrierName = (value: string) =>
  value
    .trim()
    .split(/\s+/)
    .map((word) =>
      word.length <= 4
        ? word.toUpperCase()
        : word[0].toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");

export const ShippingRatesSelector = ({
  quotes,
  selectedRate,
  onSelect,
  isLoading,
  freeShipping = false,
  disabled = false,
  ariaLabelledBy,
}: ShippingRatesSelectorProps) => {
  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-live="polite">
        <span className="sr-only">Calculando tarifas de envío</span>
        <Skeleton className="h-[72px] w-full rounded-xl" />
        <Skeleton className="h-[72px] w-full rounded-xl" />
      </div>
    );
  }

  if (!quotes || quotes.length === 0) {
    return null;
  }

  return (
    <RadioGroup
      value={selectedRate ? selectedRate.toString() : ""}
      onValueChange={(value) => onSelect(parseInt(value, 10))}
      disabled={disabled}
      aria-labelledby={ariaLabelledBy}
      className="grid grid-cols-1 gap-2.5"
    >
      {quotes.map((quote) => {
        const carrierInfo = SHIPPINGCARRIERS.find(
          (carrier) => carrier.carrier === quote.carrier,
        );
        const isSelected = selectedRate === quote.idRate;

        return (
          <div key={quote.idRate} className="relative">
            <RadioGroupItem
              value={quote.idRate.toString()}
              id={`rate-${quote.idRate}`}
              className="peer sr-only"
            />
            <Label
              htmlFor={`rate-${quote.idRate}`}
              className={cn(
                "flex min-h-[64px] cursor-pointer items-center gap-3 rounded-xl border-2 border-muted bg-card px-3.5 py-3 font-sans transition-[border-color,background-color] hover:border-primary/50",
                "peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-blue-purple/10",
                "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/50",
                )}
              >
                {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
              </span>

              {carrierInfo ? (
                <span
                  className="flex h-9 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md p-1.5"
                  style={{ backgroundColor: carrierInfo.color || "#f0f0f0" }}
                >
                  <Image
                    src={carrierInfo.logoUrl}
                    alt=""
                    width={56}
                    height={28}
                    className="h-full w-full object-contain"
                  />
                </span>
              ) : (
                <span className="flex h-9 w-14 shrink-0 items-center justify-center rounded-md bg-primary/10">
                  <Truck className="h-5 w-5 text-primary" aria-hidden="true" />
                </span>
              )}

              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-foreground">
                    {formatCarrierName(quote.carrier)}
                    {quote.product && quote.product.toLowerCase() !== "normal"
                      ? ` · ${quote.product}`
                      : ""}
                  </span>
                  {quote.badges.includes("cheapest") && (
                    <span className="rounded-full bg-kawaii-yellow-light px-2 py-0.5 text-[11px] font-bold text-yellow-900">
                      Más económica
                    </span>
                  )}
                  {quote.badges.includes("fastest") && (
                    <span className="rounded-full bg-kawaii-blue-light px-2 py-0.5 text-[11px] font-bold text-sky-900">
                      Más rápida
                    </span>
                  )}
                </span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    {formatDelivery(quote.deliveryDays)}
                  </span>
                  {quote.isCOD && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-kawaii-mint-light px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
                      <Check className="h-3 w-3 stroke-[3]" aria-hidden="true" />
                      Contraentrega disponible
                    </span>
                  )}
                </span>
              </span>

              <span className="flex shrink-0 flex-col items-end">
                {freeShipping ? (
                  <>
                    <Currency
                      value={quote.totalCost}
                      className="text-xs text-muted-foreground line-through"
                    />
                    <span className="font-quicksand text-base font-bold text-success">
                      Gratis
                    </span>
                  </>
                ) : (
                  <Currency
                    value={quote.totalCost}
                    className="font-quicksand text-base font-bold text-foreground"
                  />
                )}
              </span>
            </Label>
          </div>
        );
      })}
    </RadioGroup>
  );
};
