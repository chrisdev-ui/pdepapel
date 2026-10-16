"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { perUnitFromOrder, transportWarning } from "@/lib/product-costs";
import { cn, currencyFormatter } from "@/lib/utils";

type Mode = "unidad" | "orden";

/**
 * «Envío y otros gastos»: se guarda siempre por unidad. Con «Toda la orden» se
 * escribe el envío de la compra y cuántas unidades trajo, y el campo guarda la
 * parte de cada una. Avisa (sin bloquear) cuando el valor parece el de una orden.
 */
export function TransportCostField({
  value,
  onChange,
  disabled,
  acqPrice,
  price,
}: {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  acqPrice: number | null | undefined;
  price: number | null | undefined;
}) {
  const [mode, setMode] = useState<Mode>("unidad");
  const [orderTotal, setOrderTotal] = useState<number | null>(null);
  const [units, setUnits] = useState<string>("");
  const perUnit = perUnitFromOrder(orderTotal, units === "" ? null : Number(units));
  const warning = transportWarning({ transport: value, acqPrice, price });

  const fromOrder = (total: number | null, unitsText: string) => {
    setOrderTotal(total);
    setUnits(unitsText);
    onChange(perUnitFromOrder(total, unitsText === "" ? null : Number(unitsText)));
  };

  return (
    <div className="space-y-2" data-testid="transport-cost-field">
      <div role="group" aria-label="Cómo escribir el envío" className="inline-flex rounded-md border p-0.5">
        {(
          [
            ["unidad", "Por unidad"],
            ["orden", "Toda la orden"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={mode === key ? "secondary" : "ghost"}
            aria-pressed={mode === key}
            disabled={disabled}
            className="h-8"
            onClick={() => setMode(key)}
          >
            {label}
          </Button>
        ))}
      </div>
      {/* Lo calculado y el aviso van arriba de los campos: en el teléfono la barra fija de «Cambios sin guardar» tapa lo que queda debajo. */}
      {mode === "orden" && (
        <p className="text-sm font-medium text-foreground" data-testid="transport-per-unit" aria-live="polite">
          {perUnit === null ? "Escribe el envío de la orden y cuántas unidades trajo." : `= ${currencyFormatter(perUnit)} por unidad (esto es lo que se guarda)`}
        </p>
      )}
      {warning && (
        <p role="status" className={cn("flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900 ring-1 ring-amber-300/70")} data-testid="transport-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {warning}
        </p>
      )}
      {mode === "unidad" ? (
        <CurrencyInput placeholder="Sin registrar" disabled={disabled} value={value ?? undefined} onChange={(next) => onChange(next ?? null)} aria-label="Envío por unidad" />
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <CurrencyInput placeholder="Envío de toda la orden" disabled={disabled} value={orderTotal ?? undefined} onChange={(next) => fromOrder(next ?? null, units)} aria-label="Envío de toda la orden" />
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            placeholder="Unidades de la orden"
            disabled={disabled}
            value={units}
            onChange={(event) => fromOrder(orderTotal, event.target.value)}
            aria-label="Unidades de la orden"
          />
        </div>
      )}
    </div>
  );
}
