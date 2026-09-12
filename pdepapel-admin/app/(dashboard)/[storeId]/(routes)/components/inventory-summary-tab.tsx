import { getInventory } from "@/app/(dashboard)/[storeId]/(routes)/inventario/server/get-inventory";
import { TintBadge } from "@/components/ui/tint-badge";
import { inventoryMatchesView, summarizeInventory } from "@/lib/inventory-views";
import { compareUrgency, describeCover } from "@/lib/replenishment";
import { hasStoreLowStockThreshold, resolveLowStockThreshold } from "@/lib/product-readiness";
import prismadb from "@/lib/prismadb";
import { cn, currencyFormatter } from "@/lib/utils";
import { AlertTriangle, Boxes, ChevronRight, Package, Wallet } from "lucide-react";
import Link from "next/link";

const numberFormatter = new Intl.NumberFormat("es-CO");
const TOP_CRITICAL = 5;

function Metric({ label, value, note, href, linkLabel, icon, tint }: { label: string; value: string; note: string; href: string; linkLabel: string; icon: React.ReactNode; tint: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2.5 rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-muted-foreground">{label}</span>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg text-primary", tint)}>{icon}</span>
      </div>
      <span className="text-[24px] font-bold leading-none tracking-tight text-primary">{value}</span>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">{note}</span>
        <Link href={href} className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-primary hover:underline">
          {linkLabel}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

/**
 * Pestaña «Inventario» de Inicio: las mismas cuatro cifras que la página de
 * Inventario, con la misma regla de stock crítico, y los productos más urgentes.
 */
export async function InventorySummaryTab({ storeId }: { storeId: string }) {
  const [rows, store] = await Promise.all([
    getInventory(storeId),
    prismadb.store.findUnique({ where: { id: storeId }, select: { lowStockThreshold: true } }),
  ]);
  const threshold = resolveLowStockThreshold(store);
  const totals = summarizeInventory(rows, threshold);
  const critical = rows
    .filter((row) => inventoryMatchesView(row, "por-reponer", threshold))
    .sort(compareUrgency)
    .slice(0, TOP_CRITICAL);
  const base = `/${storeId}/inventario`;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <Metric label="Valor a costo" value={currencyFormatter(totals.costValue)} note={`${numberFormatter.format(totals.units)} unidades · a venta ${currencyFormatter(totals.retailValue)}`} href={base} linkLabel="Inventario" icon={<Wallet className="h-4 w-4" aria-hidden="true" />} tint="bg-tint-mint" />
        <Metric label="Productos activos" value={numberFormatter.format(totals.products)} note="Sin archivados ni cápsulas" href={base} linkLabel="Ver todo" icon={<Boxes className="h-4 w-4" aria-hidden="true" />} tint="bg-tint-sky" />
        <Metric label="Por reponer" value={numberFormatter.format(totals.lowStock)} note={`${numberFormatter.format(totals.runsOutThisWeek)} se acaban esta semana · ${numberFormatter.format(totals.outOfStockSelling)} agotados que vendían`} href={`${base}?vista=por-reponer`} linkLabel="Reponer" icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />} tint="bg-tint-pink" />
        <Metric label="Sin costo registrado" value={numberFormatter.format(totals.withoutCost)} note="No entran en la valorización ni en el margen" href={`${base}?vista=sin-costo`} linkLabel="Completar" icon={<Package className="h-4 w-4" aria-hidden="true" />} tint="bg-tint-cream" />
      </div>

      <section aria-labelledby="inventario-critico" className="flex flex-col gap-2.5 rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="inventario-critico" className="text-[15px] font-bold text-primary">Por reponer primero</h3>
          <div className="flex flex-wrap gap-3 text-xs font-semibold text-primary">
            <Link href={`${base}?vista=por-reponer`} className="hover:underline">Por reponer ({numberFormatter.format(totals.lowStock)})</Link>
            <Link href={`${base}?vista=agotados`} className="hover:underline">Agotados ({numberFormatter.format(totals.outOfStock)})</Link>
          </div>
        </div>
        {critical.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nada por reponer: todo lo que se vende tiene cobertura.
            {totals.outOfStock > 0 ? ` Hay ${numberFormatter.format(totals.outOfStock)} agotados sin ventas recientes.` : ""}
          </p>
        ) : (
          <ul className="flex flex-col gap-2 text-[13px]">
            {critical.map((row) => (
              <li key={row.id} className="flex items-center gap-2.5">
                <Link href={`/${storeId}/productos/${row.id}`} className="min-w-0 flex-1 truncate hover:underline" title={row.name}>
                  {row.name}
                </Link>
                {row.supplier && <span className="hidden truncate text-xs text-muted-foreground sm:inline">{row.supplier.name}</span>}
                <TintBadge label={describeCover(row.signal, { limitingComponent: row.limitingComponent }).label} tone={describeCover(row.signal).tone} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
