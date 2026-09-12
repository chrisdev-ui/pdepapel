"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SectionCard } from "@/components/ui/section-card";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import { TintBadge } from "@/components/ui/tint-badge";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { formatKardexDay } from "@/lib/kardex";
import { compareUrgency, describeCover } from "@/lib/replenishment";
import { currencyFormatter } from "@/lib/utils";
import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { InventoryRow } from "../server/get-inventory";

interface Line {
  productId: string;
  checked: boolean;
  quantity: number;
}

interface SupplierGroup {
  id: string | null;
  name: string;
  rows: InventoryRow[];
  onOrderUnits: number;
}

/** Borrador de reposición con proveedor, producto y cantidad sugerida ya diligenciados. */
export function restockHref(storeId: string, row: Pick<InventoryRow, "id" | "supplier" | "signal">): string {
  const query = new URLSearchParams();
  if (row.supplier?.id) query.set("proveedor", row.supplier.id);
  query.set("producto", row.id);
  if (row.signal.suggested > 0) query.set("cantidad", String(row.signal.suggested));
  return `/${storeId}/aprovisionamiento/nuevo?${query.toString()}`;
}

/** Agrupa las filas por proveedor; las que no tienen quedan al final. */
export function groupBySupplier(rows: InventoryRow[]): SupplierGroup[] {
  const groups = new Map<string | null, SupplierGroup>();
  for (const row of [...rows].sort(compareUrgency)) {
    const key = row.supplier?.id ?? null;
    const group = groups.get(key) ?? { id: key, name: row.supplier?.name ?? "Sin proveedor asignado", rows: [], onOrderUnits: 0 };
    group.rows.push(row);
    group.onOrderUnits += row.onOrder;
    groups.set(key, group);
  }
  return Array.from(groups.values()).sort((a, b) => {
    if (a.id === null) return 1;
    if (b.id === null) return -1;
    return b.rows.length - a.rows.length;
  });
}

/** Nota bajo el costo: de dónde sale. */
function describeCostSource(row: Pick<InventoryRow, "lastCostSource" | "lastCostAt">): string | null {
  if (row.lastCostSource === "purchase") return row.lastCostAt ? `recibido el ${formatKardexDay(row.lastCostAt)}` : "última compra recibida";
  if (row.lastCostSource === "product") return "costo del producto, sin compra recibida";
  return null;
}

function ProductCell({ row, storeId }: { row: InventoryRow; storeId: string }) {
  const sub = [
    row.sku,
    row.limitingComponent ? `limita ${row.limitingComponent}` : null,
    row.soldViaKits30 > 0 ? `${row.soldViaKits30} ${row.soldViaKits30 === 1 ? "vendido" : "vendidos"} dentro de kits en 30 días` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex min-w-0 flex-col">
      <span className="flex items-center gap-2">
        <Link href={`/${storeId}/productos/${row.id}`} className="truncate font-semibold text-primary hover:underline">{row.name}</Link>
        {row.isKit && <TintBadge label="kit" tone="lavender" />}
      </span>
      <span className="truncate text-xs text-muted-foreground">{sub}</span>
    </div>
  );
}

function SupplierCard({ group, storeId }: { group: SupplierGroup; storeId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [lines, setLines] = useState<Record<string, Line>>(() =>
    Object.fromEntries(group.rows.map((row) => [row.id, { productId: row.id, checked: !row.isKit && row.signal.suggested > 0, quantity: row.signal.suggested }])),
  );
  const [creating, setCreating] = useState(false);

  // Un kit no se compra: se reponen sus componentes, que ya suman lo vendido dentro del kit.
  const draftable = group.rows.filter((row) => !row.isKit);
  const selected = draftable.filter((row) => lines[row.id]?.checked && (lines[row.id]?.quantity ?? 0) > 0);
  const total = selected.reduce((sum, row) => sum + (lines[row.id]?.quantity ?? 0) * (row.lastCost ?? 0), 0);
  const outOfStock = group.rows.filter((row) => row.signal.outOfStockSelling).length;

  const createDraft = async () => {
    if (!group.id || selected.length === 0) return;
    try {
      setCreating(true);
      const response = await axios.post(`/api/${storeId}/restock-orders`, {
        supplierId: group.id,
        status: "DRAFT",
        shippingCost: 0,
        items: selected.map((row) => ({ productId: row.id, quantity: lines[row.id].quantity, cost: row.lastCost ?? 0 })),
      });
      toast({ title: `Borrador ${response.data.orderNumber} creado con ${selected.length} ${selected.length === 1 ? "línea" : "líneas"}.`, variant: "success" });
      router.push(`/${storeId}/aprovisionamiento/${response.data.id}`);
    } catch (error) {
      toast({ title: getErrorMessage(error), variant: "destructive" });
      setCreating(false);
    }
  };

  const withoutSupplier = group.id === null;

  return (
    <SectionCard
      id={`proveedor-${group.id ?? "sin"}`}
      title={group.name}
      description={
        withoutSupplier
          ? "Elige el proveedor en el borrador; al recibir el pedido, el producto queda con ese proveedor y pasa a su grupo."
          : `${group.rows.length} ${group.rows.length === 1 ? "producto" : "productos"}${outOfStock > 0 ? ` · ${outOfStock} ${outOfStock === 1 ? "agotado" : "agotados"}` : ""}`
      }
      action={
        withoutSupplier ? undefined : (
          <Button type="button" size="sm" onClick={createDraft} disabled={creating || selected.length === 0} isLoading={creating} loadingText="Creando…">
            {selected.length === 0 ? "Marca líneas para crear un borrador" : `Crear borrador con ${selected.length} ${selected.length === 1 ? "línea" : "líneas"}`}
          </Button>
        )
      }
    >
      {group.onOrderUnits > 0 && (
        <p className="rounded-lg border bg-tint-cream/60 px-3 py-2 text-xs text-primary">
          Hay {group.onOrderUnits} {group.onOrderUnits === 1 ? "unidad" : "unidades"} en camino de este proveedor; cuentan como cobertura y ya se descontaron del sugerido.
        </p>
      )}
      <div className="-mx-4 overflow-x-auto sm:-mx-5">
        {withoutSupplier ? (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40 text-left text-xs font-semibold text-primary">
              <tr>
                <th className="px-4 py-2">Producto</th>
                <th className="px-4 py-2 text-right">Stock</th>
                <th className="px-4 py-2">Cobertura</th>
                <th className="px-4 py-2 text-right">Sugerido</th>
                <th className="px-4 py-2 text-right"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row) => {
                const cover = describeCover(row.signal, { limitingComponent: row.limitingComponent });
                return (
                  <tr key={row.id} className="border-t">
                    <td className="px-4 py-2"><ProductCell row={row} storeId={storeId} /></td>
                    <td className="px-4 py-2 text-right"><TintBadge label={row.stock <= 0 ? "Agotado" : `${row.stock}`} tone={row.stock <= 0 ? "pink" : "cream"} /></td>
                    <td className="px-4 py-2 text-xs font-semibold text-primary">{cover.label}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{row.signal.suggested > 0 ? row.signal.suggested : "—"}</td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-1">
                        {!row.isKit && (
                          <Button asChild variant="outline" size="sm"><Link href={restockHref(storeId, row)}>Reponer</Link></Button>
                        )}
                        <Button asChild variant="ghost" size="sm"><Link href={`/${storeId}/productos/${row.id}`}>Abrir producto</Link></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40 text-left text-xs font-semibold text-primary">
              <tr>
                <th className="w-10 px-4 py-2"></th>
                <th className="px-4 py-2">Producto</th>
                <th className="px-4 py-2 text-right">Stock</th>
                <th className="px-4 py-2">Cobertura</th>
                <th className="px-4 py-2 text-right">Costo últ. compra</th>
                <th className="px-4 py-2 text-right">Cantidad</th>
                <th className="px-4 py-2 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row) => {
                const line = lines[row.id];
                const cover = describeCover(row.signal, { limitingComponent: row.limitingComponent });
                const subtotal = (!row.isKit && line?.checked ? line.quantity : 0) * (row.lastCost ?? 0);
                const costSource = describeCostSource(row);
                return (
                  <tr key={row.id} className="border-t">
                    <td className="px-4 py-2">
                      {!row.isKit && (
                        <Checkbox
                          checked={Boolean(line?.checked)}
                          onCheckedChange={(checked) => setLines((prev) => ({ ...prev, [row.id]: { ...prev[row.id], checked: checked === true } }))}
                          aria-label={`Incluir ${row.name}`}
                        />
                      )}
                    </td>
                    <td className="px-4 py-2"><ProductCell row={row} storeId={storeId} /></td>
                    <td className="px-4 py-2 text-right"><TintBadge label={`${row.stock}`} tone={row.stock <= 0 ? "pink" : row.signal.needsReplenishment ? "cream" : "slate"} /></td>
                    <td className="px-4 py-2 text-xs font-semibold text-primary">{cover.label}</td>
                    <td className="px-4 py-2 text-right">
                      {row.isKit ? (
                        <span className="text-xs text-muted-foreground">componentes</span>
                      ) : row.lastCost ? (
                        <div className="flex flex-col items-end">
                          <span className="font-mono text-xs">{currencyFormatter(row.lastCost)}</span>
                          {costSource && <span className="text-[11px] text-muted-foreground">{costSource}</span>}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">sin costo</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {row.isKit ? (
                        <span className="block text-right text-xs text-muted-foreground">Se pide por componentes: ya suman lo vendido en el kit.</span>
                      ) : (
                        <div className="flex justify-end">
                          <StockQuantityInput
                            min={0}
                            size="sm"
                            value={line?.quantity ?? 0}
                            onChange={(value) => setLines((prev) => ({ ...prev, [row.id]: { ...prev[row.id], quantity: Math.max(0, Math.floor(value || 0)) } }))}
                            ariaLabel={`Cantidad a pedir de ${row.name}`}
                          />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">{subtotal > 0 ? currencyFormatter(subtotal) : <span className="text-muted-foreground">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
            <tbody className="border-t bg-muted/30">
              <tr>
                <td colSpan={6} className="px-4 py-2 text-right text-xs text-muted-foreground">{selected.length} de {draftable.length} marcados · costo de la última compra recibida a este proveedor o, si no la hay, el del producto; editable en el borrador</td>
                <td className="px-4 py-2 text-right font-mono text-sm font-semibold text-primary">{currencyFormatter(total)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </SectionCard>
  );
}

/** Vista «Por reponer» agrupada por proveedor: un borrador de aprovisionamiento por grupo. */
export function ReplenishmentBySupplier({ rows, storeId }: { rows: InventoryRow[]; storeId: string }) {
  const groups = useMemo(() => groupBySupplier(rows), [rows]);
  if (groups.length === 0) {
    return <p className="rounded-xl border bg-white p-6 text-center text-sm text-muted-foreground">Nada por reponer: todo lo que se vende tiene cobertura.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <SupplierCard key={group.id ?? "sin-proveedor"} group={group} storeId={storeId} />
      ))}
    </div>
  );
}
