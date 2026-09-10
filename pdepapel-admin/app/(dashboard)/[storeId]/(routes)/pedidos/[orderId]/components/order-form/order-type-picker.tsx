"use client";

import { Button } from "@/components/ui/button";
import { RadioCards } from "@/components/ui/radio-cards";
import { OrderType } from "@prisma/client";
import { FileText, ShoppingBag, Sparkles, Store, Tent } from "lucide-react";
import Link from "next/link";

import { ORDER_TYPE_PRESETS, type CreatableOrderType } from "./schema";

interface OrderTypePickerProps {
  storeId: string;
  onPick: (type: CreatableOrderType) => void;
}

const ICONS: Record<CreatableOrderType, React.ReactNode> = {
  [OrderType.STANDARD]: <ShoppingBag className="h-5 w-5" aria-hidden="true" />,
  [OrderType.CUSTOM]: <Sparkles className="h-5 w-5" aria-hidden="true" />,
  [OrderType.QUOTATION]: <FileText className="h-5 w-5" aria-hidden="true" />,
};

const TINTS: Record<CreatableOrderType, string> = {
  [OrderType.STANDARD]: "bg-tint-sky",
  [OrderType.CUSTOM]: "bg-tint-cream",
  [OrderType.QUOTATION]: "bg-tint-lavender",
};

/**
 * Primer paso de un pedido nuevo: elegir qué es. Cada tipo fija el estado
 * inicial, el método de pago y qué secciones aparecen; feria y punto de venta
 * se registran en su propio módulo porque manejan inventario distinto.
 */
export function OrderTypePicker({ storeId, onPick }: OrderTypePickerProps) {
  return (
    <div className="flex flex-col gap-4">
      <RadioCards<CreatableOrderType>
        value={undefined}
        onChange={onPick}
        label="Tipo de pedido"
        idPrefix="tipo-pedido"
        options={Object.values(ORDER_TYPE_PRESETS).map((preset) => ({
          value: preset.type,
          title: preset.label,
          hint: preset.description,
          icon: (
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-primary ${TINTS[preset.type]}`}
            >
              {ICONS[preset.type]}
            </span>
          ),
        }))}
      />
      <div className="flex flex-col gap-2 rounded-xl border border-dashed bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Las ventas en mostrador y en ferias se registran desde su módulo:
          descuentan inventario al instante y no necesitan envío.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/${storeId}/ventas-rapidas`}>
              <Store className="h-4 w-4" aria-hidden="true" />
              Punto de venta
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/${storeId}/ferias`}>
              <Tent className="h-4 w-4" aria-hidden="true" />
              Ferias
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
