"use client";

import { FileSpreadsheet } from "lucide-react";
import Link from "next/link";

import { SectionCard } from "@/components/ui/section-card";

import { KitRowDetail } from "./kit-row-detail";

/** Lo que la feria dejó en el sistema, ya cerrada. Solo lectura. */
export interface PhaseClosedProps {
  storeId: string;
  fairEventId: string;
  closedAt: string | null;
  paidOrders: number;
  totals: { allocated: number; returned: number };
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
              Reserva −{totals.allocated} · Devolución +{totals.returned}, con
              referencia a esta feria.
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-2 py-2 text-left font-medium">Producto</th>
                <th className="px-2 py-2 text-right font-medium">Reservado</th>
                <th className="px-2 py-2 text-right font-medium">Vendido</th>
                <th className="px-2 py-2 text-right font-medium">Devuelto</th>
                <th className="px-2 py-2 text-right font-medium">Dañado</th>
                <th className="px-2 py-2 text-right font-medium">Perdido</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="px-2 py-2">
                    <span className="font-medium">{item.product.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      SKU {item.product.sku}
                    </span>
                    <KitRowDetail
                      components={item.kitComponents}
                      className="mt-1"
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    {item.allocatedQuantity}
                  </td>
                  <td className="px-2 py-2 text-right">{item.soldQuantity}</td>
                  <td className="px-2 py-2 text-right">
                    {item.returnedQuantity}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {item.damagedQuantity}
                  </td>
                  <td className="px-2 py-2 text-right">{item.lostQuantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </>
  );
}
