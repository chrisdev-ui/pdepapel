"use client";

import { Button } from "@/components/ui/button";
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
      <div role="group" aria-label="Tipo de pedido" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(Object.values(ORDER_TYPE_PRESETS)).map((preset) => (
          <button
            key={preset.type}
            type="button"
            onClick={() => onPick(preset.type)}
            className="flex min-h-[44px] flex-col items-start gap-3 rounded-xl border bg-white p-4 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className={`flex h-10 w-10 items-center justify-center rounded-lg text-primary ${TINTS[preset.type]}`}>{ICONS[preset.type]}</span>
            <span className="flex flex-col gap-1">
              <span className="text-[15px] font-bold text-primary">{preset.label}</span>
              <span className="text-sm text-muted-foreground">{preset.description}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 rounded-xl border border-dashed bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Las ventas en mostrador y en ferias se registran desde su módulo: descuentan inventario al instante y no necesitan envío.
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
