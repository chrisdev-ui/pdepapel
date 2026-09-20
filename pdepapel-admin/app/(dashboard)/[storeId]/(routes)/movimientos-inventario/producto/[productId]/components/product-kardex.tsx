"use client";

import type { InventoryMovementType } from "@prisma/client";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, History, Package, PackageCheck, SlidersHorizontal, TrendingDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { Models } from "@/constants";

import { DataTable } from "@/components/ui/data-table";
import { SectionCard } from "@/components/ui/section-card";
import { TintBadge } from "@/components/ui/tint-badge";
import {
  describeAdjustmentCounts,
  formatKardexDate,
  formatKardexMonth,
  formatSignedQuantity,
  MOVEMENT_LABELS,
} from "@/lib/kardex";
import { describeRate } from "@/lib/replenishment";
import { useCanWrite } from "@/components/shell/viewer-access";
import { currencyFormatter } from "@/lib/utils";

import { AdjustInventoryModal } from "../../../components/adjust-inventory-modal";
import { kardexColumns } from "./kardex-columns";
import type { KardexRow, ProductKardex } from "../server/get-product-kardex";



function stockTone(stock: number, threshold: number): string {
  if (stock <= 0) return "pink";
  if (stock <= threshold) return "cream";
  return "mint";
}


interface ProductKardexProps {
  storeId: string;
  kardex: ProductKardex;
  /** `?todo=1` activo. */
  showAll: boolean;
  /** `?tipo=` activo. */
  typeFilter: InventoryMovementType | null;
}

export function ProductKardexView({ storeId, kardex, showAll, typeFilter }: ProductKardexProps) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustDefaults, setAdjustDefaults] = useState<{ intentId: string; action: "add" | "subtract"; quantity: number; reasonId: string } | null>(null);
  const { product, threshold, metrics, rows } = kardex;

  const buildHref = (next: { all?: boolean; type?: InventoryMovementType | null }) => {
    const query = new URLSearchParams();
    const all = next.all ?? showAll;
    const type = next.type === undefined ? typeFilter : next.type;
    if (all) query.set("todo", "1");
    if (type) query.set("tipo", type);
    const suffix = query.toString();
    return `/${storeId}/movimientos-inventario/producto/${product.id}${suffix ? `?${suffix}` : ""}`;
  };

  const restockHref = useMemo(() => {
    const query = new URLSearchParams();
    if (product.supplier?.id) query.set("proveedor", product.supplier.id);
    query.set("producto", product.id);
    return `/${storeId}/aprovisionamiento/nuevo?${query.toString()}`;
  }, [product.id, product.supplier?.id, storeId]);

  const movementsHref = `/${storeId}/movimientos-inventario?producto=${encodeURIComponent(product.id)}`;

  const openAdjust = (defaults: { intentId: string; action: "add" | "subtract"; quantity: number; reasonId: string } | null) => {
    setAdjustDefaults(defaults);
    setAdjustOpen(true);
  };

  const stockLabel = `${product.stock.toLocaleString("es-CO")} en stock`;
  const subtitle = [
    product.sku,
    product.supplier?.name ?? "Sin proveedor",
    `costo actual ${product.acqPrice ? currencyFormatter(product.acqPrice) : "sin registrar"}`,
    kardex.firstMovementAt
      ? `${kardex.totalCount.toLocaleString("es-CO")} ${kardex.totalCount === 1 ? "movimiento" : "movimientos"} desde ${formatKardexMonth(kardex.firstMovementAt)}`
      : "sin movimientos registrados",
  ].join(" · ");

  const coverNote = [
    describeRate(metrics),
    metrics.viaKits30 > 0 ? `${metrics.viaKits30.toLocaleString("es-CO")} dentro de kits` : null,
    "la misma cifra que Inventario",
  ]
    .filter(Boolean)
    .join(" · ");

  // Diferencia entre el stock y el último saldo: lo que un ajuste debe corregir.
  const drift = metrics.latestBalance === null ? 0 : product.stock - metrics.latestBalance;
  const periodLabel = kardex.windowDays === null ? "todo el historial" : `últimos ${kardex.windowDays} días`;

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Ruta" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <Link href={`/${storeId}/inventario`} className="hover:text-primary">Inventario</Link>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <Link href={movementsHref} className="hover:text-primary">Movimientos de este producto</Link>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <span className="truncate font-semibold text-primary">{product.name}</span>
      </nav>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button asChild variant="outline" size="icon" aria-label="Volver a inventario" className="shrink-0">
            <Link href={`/${storeId}/inventario`}><ArrowLeft className="h-4 w-4" aria-hidden="true" /></Link>
          </Button>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-primary">Kardex · {product.name}</h1>
              <TintBadge label={stockLabel} tone={stockTone(product.stock, threshold)} />
              {product.isKit && <TintBadge label="Kit" tone="lavender" />}
            </div>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canWrite && (
            <Button variant="outline" onClick={() => openAdjust(null)} disabled={product.isKit} title={product.isKit ? "El stock de un kit se calcula desde sus componentes" : undefined}>
              <History className="h-4 w-4" aria-hidden="true" />Ajustar inventario
            </Button>
          )}
          {product.isKit ? (
            <Button asChild variant="outline" title="Un kit no se compra: se reponen sus componentes">
              <Link href={`/${storeId}/productos/${product.id}`}><Package className="h-4 w-4" aria-hidden="true" />Ver componentes</Link>
            </Button>
          ) : canWrite ? (
            <Button asChild>
              <Link href={restockHref}><Package className="h-4 w-4" aria-hidden="true" />Reponer</Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <MetricCard label="Vendidas · 30 días" value={metrics.sold30.toLocaleString("es-CO")} note={coverNote} icon={<TrendingDown className="h-4 w-4" aria-hidden="true" />} tint="bg-tint-sky" />
        <MetricCard
          label="Recibidas · 90 días"
          value={metrics.received90.toLocaleString("es-CO")}
          note={`${metrics.receipts90.toLocaleString("es-CO")} ${metrics.receipts90 === 1 ? "recepción" : "recepciones"}`}
          icon={<PackageCheck className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-mint"
        />
        <MetricCard
          label="Ajustes y pérdidas"
          value={formatSignedQuantity(metrics.adjustments90.total)}
          note={describeAdjustmentCounts(metrics.adjustments90.byType)}
          icon={<SlidersHorizontal className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-cream"
        />
        <MetricCard
          label="Cuadre"
          value={metrics.balanced ? "Cuadra" : "No cuadra"}
          note={
            metrics.latestBalance === null
              ? "Sin movimientos para comparar con el stock"
              : metrics.balanced
                ? "El saldo de los movimientos coincide con el stock"
                : `El stock (${product.stock.toLocaleString("es-CO")}) no coincide con el último saldo (${metrics.latestBalance.toLocaleString("es-CO")}). Alguien tocó el stock sin pasar por el kardex.`
          }
          icon={metrics.balanced ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
          tint={metrics.balanced ? "bg-tint-mint" : "bg-tint-pink"}
          tone={metrics.balanced ? "default" : "care"}
          action={
            canWrite && !metrics.balanced && drift !== 0 && !product.isKit ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                // A 390 px la tarjeta mide ~187 px y el texto no cabe en una
                // línea: sin esto el botón se sale de su propia tarjeta.
                className="h-auto w-full whitespace-normal py-1.5"
                onClick={() =>
                  openAdjust({
                    // El libro va por detrás del stock: el ajuste lleva el saldo hasta el stock real.
                    intentId: "MANUAL_ADJUSTMENT",
                    action: drift > 0 ? "add" : "subtract",
                    quantity: Math.abs(drift),
                    reasonId: "cuadre-kardex",
                  })
                }
              >
                Registrar ajuste de {formatSignedQuantity(drift)}
              </Button>
            ) : !metrics.balanced && product.isKit ? (
              <span className="text-xs text-muted-foreground">El stock de un kit se recalcula al guardar el producto.</span>
            ) : undefined
          }
        />
      </div>

      <SectionCard
        id="historial"
        title="Historial con saldo"
        description={`${rows.length.toLocaleString("es-CO")} ${rows.length === 1 ? "movimiento" : "movimientos"} · ${periodLabel}${typeFilter ? ` · solo ${MOVEMENT_LABELS[typeFilter].toLowerCase()}` : ""}${kardex.hasMore ? " · la lista se cortó en el tope" : ""}`}
      >
        <DataTable
          columns={kardexColumns}
          data={rows}
          tableKey={Models.ProductKardex}
          searchPlaceholder="Buscar origen, motivo o quién…"
          filters={[
            {
              columnKey: "type",
              title: "Movimiento",
              options: Array.from(new Set(rows.map((row) => row.type))).map((type) => ({ label: MOVEMENT_LABELS[type], value: type })),
            },
          ]}
          emptyState={{
            title: typeFilter ? "No hay movimientos de este tipo en el periodo" : `No hay movimientos en ${periodLabel}`,
            description: "Cada venta, recepción o ajuste de este producto deja una fila con su saldo.",
          }}
        />
        <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Saldo inicial del periodo: <span className="font-semibold text-primary">{kardex.openingBalance.toLocaleString("es-CO")}</span> ·{" "}
            {kardex.olderCount.toLocaleString("es-CO")} {kardex.olderCount === 1 ? "movimiento anterior" : "movimientos anteriores"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href={movementsHref}>Ver en la lista general</Link>
            </Button>
            <Button asChild variant="soft" size="sm">
              <Link href={buildHref({ all: !showAll })}>{showAll ? "Ver solo los últimos 90 días" : "Ver todo el historial"}</Link>
            </Button>
          </div>
        </div>
      </SectionCard>

      <AdjustInventoryModal
        isOpen={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        onConfirm={() => {
          setAdjustOpen(false);
          router.refresh();
        }}
        defaultProductId={product.id}
        defaults={adjustDefaults}
      />
    </div>
  );
}
