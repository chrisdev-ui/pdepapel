"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SectionCard } from "@/components/ui/section-card";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import { TintBadge } from "@/components/ui/tint-badge";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
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

function SupplierCard({ group, storeId }: { group: SupplierGroup; storeId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [lines, setLines] = useState<Record<string, Line>>(() =>
    Object.fromEntries(group.rows.map((row) => [row.id, { productId: row.id, checked: row.signal.suggested > 0, quantity: row.signal.suggested }])),
  );
  const [creating, setCreating] = useState(false);

  const selected = group.rows.filter((row) => lines[row.id]?.checked && (lines[row.id]?.quantity ?? 0) > 0);
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

  return (
    <SectionCard
      id={`proveedor-${group.id ?? "sin"}`}
      title={group.name}
      description={
        group.id
          ? `${group.rows.length} ${group.rows.length === 1 ? "producto" : "productos"}${outOfStock > 0 ? ` · ${outOfStock} ${outOfStock === 1 ? "agotado" : "agotados"}` : ""}`
          : "Aparecen aquí hasta que un producto tenga proveedor; recibir un pedido de aprovisionamiento lo asigna solo."
      }
      action={
        group.id ? (
          <Button type="button" size="sm" onClick={createDraft} disabled={creating || selected.length === 0} isLoading={creating} loadingText="Creando…">
            {selected.length === 0 ? "Marca líneas para crear un borrador" : `Crear borrador con ${selected.length} ${selected.length === 1 ? "línea" : "líneas"}`}
          </Button>
        ) : undefined
      }
    >
      {group.onOrderUnits > 0 && (
        <p className="rounded-lg border bg-tint-cream/60 px-3 py-2 text-xs text-primary">
          Hay {group.onOrderUnits} {group.onOrderUnits === 1 ? "unidad" : "unidades"} en camino de este proveedor; cuentan como cobertura y ya se descontaron del sugerido.
        </p>
      )}
      <div className="-mx-4 overflow-x-auto sm:-mx-5">
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
              const subtotal = (line?.checked ? line.quantity : 0) * (row.lastCost ?? 0);
              return (
                <tr key={row.id} className="border-t">
                  <td className="px-4 py-2">
                    {group.id && (
                      <Checkbox
                        checked={Boolean(line?.checked)}
                        onCheckedChange={(checked) => setLines((prev) => ({ ...prev, [row.id]: { ...prev[row.id], checked: checked === true } }))}
                        aria-label={`Incluir ${row.name}`}
                      />
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex min-w-0 flex-col">
                      <Link href={`/${storeId}/productos/${row.id}`} className="truncate font-semibold text-primary hover:underline">{row.name}</Link>
                      <span className="truncate text-xs text-muted-foreground">{row.sku}{row.limitingComponent ? ` · limita ${row.limitingComponent}` : ""}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right"><TintBadge label={`${row.stock}`} tone={row.stock <= 0 ? "pink" : row.signal.needsReplenishment ? "cream" : "slate"} /></td>
                  <td className="px-4 py-2 text-xs font-semibold text-primary">{cover.label}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{row.lastCost ? currencyFormatter(row.lastCost) : "—"}</td>
                  <td className="px-4 py-2">
                    {group.id ? (
                      <div className="flex justify-end">
                        <StockQuantityInput
                          min={0}
                          size="sm"
                          value={line?.quantity ?? 0}
                          onChange={(value) => setLines((prev) => ({ ...prev, [row.id]: { ...prev[row.id], quantity: Math.max(0, Math.floor(value || 0)) } }))}
                          ariaLabel={`Cantidad a pedir de ${row.name}`}
                        />
                      </div>
                    ) : (
                      <span className="block text-right font-mono text-xs">{row.signal.suggested}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{subtotal > 0 ? currencyFormatter(subtotal) : <span className="text-muted-foreground">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
          {group.id && (
            <tbody className="border-t bg-muted/30">
              <tr>
                <td colSpan={6} className="px-4 py-2 text-right text-xs text-muted-foreground">{selected.length} de {group.rows.length} marcados · costo de la última compra a este proveedor, editable en el borrador</td>
                <td className="px-4 py-2 text-right font-mono text-sm font-semibold text-primary">{currencyFormatter(total)}</td>
              </tr>
            </tbody>
          )}
        </table>
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
