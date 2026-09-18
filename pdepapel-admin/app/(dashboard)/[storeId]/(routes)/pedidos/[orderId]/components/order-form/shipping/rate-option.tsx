"use client";

import { Label } from "@/components/ui/label";
import { RadioGroupItem } from "@/components/ui/radio-group";
import { TintBadge } from "@/components/ui/tint-badge";
import { getCarrierInfo } from "@/constants/shipping";
import { cn, currencyFormatter } from "@/lib/utils";
import Image from "next/image";

import type { ShippingQuote } from "../schema";

interface RateOptionProps {
  quote: ShippingQuote;
  selected: boolean;
  disabled: boolean;
}

export function RateOption({ quote, selected, disabled }: RateOptionProps) {
  const info = getCarrierInfo(quote.carrier);
  return (
    <div>
      <RadioGroupItem
        value={quote.idRate.toString()}
        id={`rate-${quote.idRate}`}
        className="peer sr-only"
        disabled={disabled}
      />
      <Label
        htmlFor={`rate-${quote.idRate}`}
        className={cn(
          "flex min-h-[56px] cursor-pointer flex-col gap-2 rounded-lg border-2 bg-white p-3 transition-colors sm:flex-row sm:items-center sm:justify-between",
          selected
            ? "border-primary bg-accent/40"
            : "border-border hover:border-primary/40",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          {info && (
            <span
              className="flex h-10 w-16 shrink-0 items-center justify-center rounded-md p-1.5"
              style={{ backgroundColor: info.color || "#FFFFFF" }}
            >
              <Image
                src={info.logoUrl}
                alt={info.comercialName}
                width={56}
                height={28}
                className="h-full w-full object-contain"
                unoptimized
              />
            </span>
          )}
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2 font-semibold text-primary">
              {quote.carrier}
              <TintBadge
                label={
                  quote.isCOD
                    ? "Recauda contra entrega"
                    : "Solo pago anticipado"
                }
                tone={quote.isCOD ? "mint" : "slate"}
                className="px-2 py-0 text-[11px]"
              />
            </span>
            <span className="text-xs text-muted-foreground">
              {quote.product} · entrega en {quote.deliveryDays}{" "}
              {Number(quote.deliveryDays) === 1 ? "día" : "días"}
            </span>
          </span>
        </span>
        <span className="flex items-baseline gap-2 sm:flex-col sm:items-end sm:gap-0">
          <span className="text-lg font-bold text-primary">
            {currencyFormatter(quote.totalCost)}
          </span>
          <span className="text-xs text-muted-foreground">
            flete {currencyFormatter(quote.flete)} · seguro{" "}
            {currencyFormatter(quote.minimumInsurance)}
          </span>
        </span>
      </Label>
    </div>
  );
}
