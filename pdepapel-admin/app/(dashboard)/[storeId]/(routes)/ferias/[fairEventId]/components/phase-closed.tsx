"use client";

import { FileSpreadsheet } from "lucide-react";
import Link from "next/link";

import { SectionCard } from "@/components/ui/section-card";

import { ReservedItemsTable } from "./reserved-items-table";

/** Lo que la feria dejó en el sistema, ya cerrada. Solo lectura. */
export interface PhaseClosedProps {
  storeId: string;
  fairEventId: string;
  closedAt: string | null;
  paidOrders: number;
  /** `allocatedUnits` y `returned` son piezas: lo que el kardex movió de verdad. */
  totals: { allocated: number; allocatedUnits: number; returned: number };
  items: {
    id: string;
    allocatedQuantity: number;
    soldQuantity: number;
    returnedQuantity: number;
    damagedQuantity: number;
    lostQuantity: number;
    product: { name: string; sku: string };
    /** Piezas de un kit reservado; vacío o ausente en un producto suelto. */
    kitComponents?: { name: string; quantityPerKit: number }[];
  }[];
  formatDate: (value: string | null) => string | null;
}

/**
 * Fase «Cerrada»: el historial. Sale del armazón porque no comparte estado con
 * las otras fases —cuando llega aquí ya no hay nada que escribir— y porque el
 * archivo del taller tenía las cuatro fases dentro del mismo componente.
 */
export function PhaseClosed({
  storeId,
  fairEventId,
  closedAt,
  paidOrders,
  totals,
  items,
  formatDate,
}: PhaseClosedProps) {
  return (
    <>
      <SectionCard
        id="despues"
        title="Después del cierre"
        description={`Cerrada el ${formatDate(closedAt) ?? "—"}. Todo lo que la feria dejó en el sistema, y el único lugar donde se corrige.`}
      >
        <div className="grid gap-3 md:grid-cols-3">
          <Link
            href={`/${storeId}/movimientos-inventario?referencia=${fairEventId}`}
            className="flex flex-col gap-1 rounded-xl border bg-white p-4 transition-colors hover:bg-accent/40"
          >
            <span className="font-semibold text-primary">
              Movimientos en el kardex
            </span>
            <span className="text-xs text-muted-foreground">
              Reserva −{totals.allocatedUnits} · Devolución +{totals.returned},
              con referencia a esta feria.
            </span>
          </Link>
          <a
            href="#ventas-feria"
            className="flex flex-col gap-1 rounded-xl border bg-white p-4 transition-colors hover:bg-accent/40"
          >
            <span className="font-semibold text-primary">
              {paidOrders} ventas de feria
            </span>
            <span className="text-xs text-muted-foreground">
              Pedidos pagados tipo feria; solo lectura. También aparecen en
              Pedidos y en los reportes tributarios.
            </span>
          </a>
          <Link
            href={`/${storeId}/movimientos-inventario?feria=${fairEventId}`}
            className="flex flex-col gap-1 rounded-xl border border-tint-pink bg-tint-pink/20 p-4 transition-colors hover:bg-tint-pink/40"
          >
            <span className="inline-flex items-center gap-2 font-semibold text-primary">
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              ¿Faltó registrar ventas?
            </span>
            <span className="text-xs text-muted-foreground">
              Conciliar con la plantilla desde Movimientos, ya con esta feria
              elegida.
            </span>
          </Link>
        </div>
      </SectionCard>

      <SectionCard
        id="inventario-cerrado"
        title="Inventario conciliado"
        description="Solo lectura. Lo devuelto volvió al stock en línea; lo dañado y perdido quedó solo aquí."
      >
        <ReservedItemsTable items={items} closed />
      </SectionCard>
    </>
  );
}
