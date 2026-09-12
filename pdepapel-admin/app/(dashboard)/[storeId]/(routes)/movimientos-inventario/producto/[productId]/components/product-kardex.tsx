"use client";

import type { InventoryMovementType } from "@prisma/client";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, History, Package, PackageCheck, SlidersHorizontal, TrendingDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TintBadge } from "@/components/ui/tint-badge";
import {
  describeAdjustmentCounts,
  formatKardexDate,
  formatKardexMonth,
  formatSignedQuantity,
  MOVEMENT_LABELS,
  MOVEMENT_TONES,
} from "@/lib/kardex";
import { cn, currencyFormatter } from "@/lib/utils";

import { AdjustInventoryModal } from "../../../components/adjust-inventory-modal";
import type { KardexRow, ProductKardex } from "../server/get-product-kardex";

const ALL_TYPES = "todos";

/** Orden de los tipos en el filtro: primero lo que más se consulta. */
const FILTER_TYPES: InventoryMovementType[] = [
  "ORDER_PLACED",
  "IN_PERSON_SALE",
  "ORDER_CANCELLED",
  "RESTOCK_RECEIVED",
  "PURCHASE",
  "MANUAL_ADJUSTMENT",
  "DAMAGE",
  "LOST",
  "STORE_USE",
  "PROMOTION",
  "RETURN",
  "FESTIVAL_ALLOCATION",
  "FESTIVAL_RETURN",
  "INITIAL_INTAKE",
  "INITIAL_MIGRATION",
];

function stockTone(stock: number, threshold: number): string {
  if (stock <= 0) return "pink";
  if (stock <= threshold) return "cream";
  return "mint";
}

function Metric({ label, value, note, icon, tint, tone = "default" }: { label: string; value: string; note?: string; icon: React.ReactNode; tint: string; tone?: "default" | "care" }) {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col gap-2 rounded-xl border bg-white p-4 shadow-sm", tone === "care" && "border-tint-pink")}>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-muted-foreground">{label}</span>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg text-primary", tint)}>{icon}</span>
      </div>
      <span className="text-[24px] font-bold leading-none tracking-tight text-primary">{value}</span>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </div>
  );
}

function ReferenceCell({ reference }: { reference: KardexRow["reference"] }) {
  if (!reference) return <span className="text-muted-foreground">—</span>;
  const label = reference.href ? (
    <Link href={reference.href} className="font-semibold text-primary underline-offset-4 hover:underline">
      {reference.label}
    </Link>
  ) : (
    <span className="text-primary">{reference.label}</span>
  );
  return (
    <div className="flex min-w-0 flex-col">
      <span className="truncate">{label}</span>
      {reference.secondary && <span className="truncate text-xs text-muted-foreground">{reference.secondary}</span>}
    </div>
  );
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
  const [adjustOpen, setAdjustOpen] = useState(false);
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

  const stockLabel = `${product.stock.toLocaleString("es-CO")} en stock`;
  const subtitle = [
    product.sku,
    product.supplier?.name ?? "Sin proveedor",
    `costo actual ${product.acqPrice ? currencyFormatter(product.acqPrice) : "sin registrar"}`,
    kardex.firstMovementAt
      ? `${kardex.totalCount.toLocaleString("es-CO")} ${kardex.totalCount === 1 ? "movimiento" : "movimientos"} desde ${formatKardexMonth(kardex.firstMovementAt)}`
      : "sin movimientos registrados",
  ].join(" · ");

  const coverNote =
    metrics.coverDays === null
      ? "Sin ventas en 30 días"
      : `${metrics.weeklyRate.toLocaleString("es-CO")} por semana · ${metrics.coverDays.toLocaleString("es-CO")} ${metrics.coverDays === 1 ? "día" : "días"} de cobertura`;

  const periodLabel = kardex.windowDays === null ? "todo el historial" : `últimos ${kardex.windowDays} días`;

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Ruta" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <Link href={`/${storeId}/inventario`} className="hover:text-primary">Inventario</Link>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <Link href={`/${storeId}/movimientos-inventario`} className="hover:text-primary">Movimientos</Link>
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
          <Button variant="outline" onClick={() => setAdjustOpen(true)} disabled={product.isKit} title={product.isKit ? "El stock de un kit se calcula desde sus componentes" : undefined}>
            <History className="h-4 w-4" aria-hidden="true" />Ajustar inventario
          </Button>
          <Button asChild>
            <Link href={restockHref}><Package className="h-4 w-4" aria-hidden="true" />Reponer</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <Metric label="Vendidas · 30 días" value={metrics.sold30.toLocaleString("es-CO")} note={coverNote} icon={<TrendingDown className="h-4 w-4" aria-hidden="true" />} tint="bg-tint-sky" />
        <Metric
          label="Recibidas · 90 días"
          value={metrics.received90.toLocaleString("es-CO")}
          note={`${metrics.receipts90.toLocaleString("es-CO")} ${metrics.receipts90 === 1 ? "recepción" : "recepciones"}`}
          icon={<PackageCheck className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-mint"
        />
        <Metric
          label="Ajustes y pérdidas"
          value={formatSignedQuantity(metrics.adjustments90.total)}
          note={describeAdjustmentCounts(metrics.adjustments90.byType)}
          icon={<SlidersHorizontal className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-cream"
        />
        <Metric
          label="Cuadre"
          value={metrics.balanced ? "Cuadra" : "No cuadra"}
          note={
            metrics.latestBalance === null
              ? "Sin movimientos para comparar con el stock"
              : metrics.balanced
                ? "El saldo de los movimientos coincide con el stock"
                : `El stock (${product.stock.toLocaleString("es-CO")}) no coincide con el último saldo (${metrics.latestBalance.toLocaleString("es-CO")}): revisa los últimos movimientos`
          }
          icon={metrics.balanced ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
          tint={metrics.balanced ? "bg-tint-mint" : "bg-tint-pink"}
          tone={metrics.balanced ? "default" : "care"}
        />
      </div>

      <SectionCard
        id="historial"
        title="Historial con saldo"
        description={`${rows.length.toLocaleString("es-CO")} ${rows.length === 1 ? "movimiento" : "movimientos"} · ${periodLabel}${typeFilter ? ` · solo ${MOVEMENT_LABELS[typeFilter].toLowerCase()}` : ""}${kardex.hasMore ? " · la lista se cortó en el tope" : ""}`}
        action={
          <Select value={typeFilter ?? ALL_TYPES} onValueChange={(value) => router.push(buildHref({ type: value === ALL_TYPES ? null : (value as InventoryMovementType) }))}>
            <SelectTrigger className="w-[190px]" aria-label="Filtrar por tipo de movimiento">
              <SelectValue placeholder="Todos los movimientos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TYPES}>Todos los movimientos</SelectItem>
              {FILTER_TYPES.map((type) => (
                <SelectItem key={type} value={type}>{MOVEMENT_LABELS[type]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      >
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Movimiento</TableHead>
                <TableHead>Referencia</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">Costo</TableHead>
                <TableHead>Quién</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    {typeFilter ? "No hay movimientos de este tipo en el periodo." : `No hay movimientos en ${periodLabel}.`}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-sm text-primary">{formatKardexDate(row.createdAt)}</TableCell>
                    <TableCell><TintBadge label={MOVEMENT_LABELS[row.type]} tone={MOVEMENT_TONES[row.type]} /></TableCell>
                    <TableCell className="max-w-[280px] text-sm"><ReferenceCell reference={row.reference} /></TableCell>
                    <TableCell className={cn("whitespace-nowrap text-right font-mono text-sm font-semibold", row.quantity < 0 ? "text-red-600" : "text-green-600")}>
                      {formatSignedQuantity(row.quantity)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-mono text-sm font-bold text-primary">{row.newStock.toLocaleString("es-CO")}</TableCell>
                    <TableCell className="whitespace-nowrap text-right font-mono text-sm text-primary">{row.cost === null ? "—" : currencyFormatter(row.cost)}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-primary">{row.who}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Saldo inicial del periodo: <span className="font-semibold text-primary">{kardex.openingBalance.toLocaleString("es-CO")}</span> ·{" "}
            {kardex.olderCount.toLocaleString("es-CO")} {kardex.olderCount === 1 ? "movimiento anterior" : "movimientos anteriores"}
          </p>
          <Button asChild variant="soft" size="sm">
            <Link href={buildHref({ all: !showAll })}>{showAll ? "Ver solo los últimos 90 días" : "Ver todo el historial"}</Link>
          </Button>
        </div>
      </SectionCard>

      <AdjustInventoryModal
        isOpen={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        onConfirm={() => {
          setAdjustOpen(false);
          router.refresh();
        }}
        products={[{ id: product.id, name: product.name, stock: product.stock }]}
        defaultProductId={product.id}
      />
    </div>
  );
}
