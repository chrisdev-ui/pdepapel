"use client";

import { ArrowDown, ArrowUp, FileSpreadsheet, Plus, SlidersHorizontal, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { Models } from "@/constants";

import { useCanWrite } from "@/components/shell/viewer-access";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { MetricCard } from "@/components/ui/metric-card";
import { ProductScanButton } from "@/components/ui/product-scan-button";
import { TintBadge } from "@/components/ui/tint-badge";
import { formatKardexDate, formatSignedQuantity, MOVEMENT_LABELS, MOVEMENT_TONES } from "@/lib/kardex";
import {
  DEFAULT_MOVEMENT_VIEW,
  describeAdjustmentMix,
  isMovementView,
  MOVEMENT_SUMMARY_DAYS,
  MOVEMENT_VIEWS,
  movementMatchesView,
  summarizeMovements,
  type MovementView,
} from "@/lib/movement-views";
import { cn } from "@/lib/utils";

import { AdjustInventoryModal } from "./adjust-inventory-modal";
import { columns, InventoryMovementColumn, typeLabels } from "./columns";
import { ReconciliationImportModal } from "./reconciliation-import-modal";

const numberFormatter = new Intl.NumberFormat("es-CO");
const VIEW_PARAM = "vista";

export interface MovementsScope {
  /** Días de la ventana aplicada; null si se pidió todo el historial. */
  days: number | null;
  /** El tope dejó movimientos por fuera. */
  hasMore: boolean;
  /** Tope de filas aplicado; null si no hubo. */
  take: number | null;
  /** La URL pidió `todo=1`. */
  showAll: boolean;
}

export function describeMovementsScope(scope: MovementsScope, count: number): string {
  const total = `${numberFormatter.format(count)} ${count === 1 ? "movimiento" : "movimientos"}`;
  if (scope.days !== null) return `Mostrando los últimos ${scope.days} días · ${total}`;
  if (scope.hasMore && scope.take)
    return `Mostrando todo el historial · ${total} (los ${numberFormatter.format(scope.take)} más recientes; hay más antiguos)`;
  return `Mostrando todo el historial · ${total}`;
}

interface InventoryMovementClientProps {
  data: InventoryMovementColumn[];
  scope: MovementsScope;
  reference: { id: string; label: string | null } | null;
  product: { id: string; name: string | null } | null;
  fairContext: { id: string; name: string; status: string } | null;
  openImporter: boolean;
  /** El panel de incidencias, que ahora vive en su propia pestaña. */
  issuesPanel: React.ReactNode;
  openIssues: number;
}

/** Tarjeta por fila en teléfono; la tabla se esconde por debajo de `sm`. */
function MovementMobileCard({ row, storeId }: { row: InventoryMovementColumn; storeId: string }) {
  const quantity = row.quantity;
  return (
    <article className="flex flex-col gap-2.5 rounded-xl border bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <TintBadge label={MOVEMENT_LABELS[row.type]} tone={MOVEMENT_TONES[row.type]} />
        <span
          className={cn(
            "whitespace-nowrap font-mono text-lg font-bold tabular-nums",
            quantity > 0 && "text-emerald-700",
            quantity < 0 && "text-red-600",
            quantity === 0 && "text-muted-foreground",
          )}
        >
          {quantity === 0 ? "0" : formatSignedQuantity(quantity)}
        </span>
      </div>
      <div className="min-w-0">
        {row.productId ? (
          <Link href={`/${storeId}/movimientos-inventario/producto/${row.productId}`} className="block truncate font-semibold text-primary">
            {row.productName}
          </Link>
        ) : (
          <span className="block truncate font-semibold text-primary">{row.productName}</span>
        )}
        <span className="block truncate font-mono text-xs text-muted-foreground">
          {[row.productSku, `queda ${row.newStock.toLocaleString("es-CO")}`].filter(Boolean).join(" · ")}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 border-t pt-2">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {[formatKardexDate(row.createdAt), row.userName].filter(Boolean).join(" · ")}
        </span>
        {row.reference?.href ? (
          <Link href={row.reference.href} className="shrink-0 text-xs font-semibold text-primary hover:underline">
            Ver origen
          </Link>
        ) : null}
      </div>
    </article>
  );
}

export const InventoryMovementClient: React.FC<InventoryMovementClientProps> = ({
  data,
  scope,
  reference,
  product,
  fairContext,
  openImporter,
  issuesPanel,
  openIssues,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const canWrite = useCanWrite();
  const storeId = pathname.split("/")[1] ?? "";
  const [open, setOpen] = useState(false);
  const [reconciliationOpen, setReconciliationOpen] = useState(openImporter || fairContext !== null);

  // La URL manda; el estado local solo cubre el hueco hasta que Next refleja
  // el replaceState. Mismo patrón que Productos, Pedidos e Inventario.
  const requested = searchParams.get(VIEW_PARAM);
  const requestedView: MovementView = isMovementView(requested) ? requested : DEFAULT_MOVEMENT_VIEW;
  const [selected, setSelected] = useState<{ base: MovementView; view: MovementView } | null>(null);
  const view = selected?.base === requestedView ? selected.view : requestedView;

  const setView = (next: MovementView) => {
    setSelected({ base: requestedView, view: next });
    const query = new URLSearchParams(searchParams.toString());
    if (next === DEFAULT_MOVEMENT_VIEW) query.delete(VIEW_PARAM);
    else query.set(VIEW_PARAM, next);
    const suffix = query.toString();
    window.history.replaceState(null, "", suffix ? `${pathname}?${suffix}` : pathname);
  };

  const totals = useMemo(() => summarizeMovements(data, { pending: openIssues }), [data, openIssues]);
  const rows = useMemo(() => data.filter((row) => movementMatchesView(row, view)), [data, view]);

  const filters = useMemo(
    () => [
      {
        columnKey: "type",
        title: "Tipo",
        options: Array.from(new Set(data.map((row) => row.type))).map((type) => ({ label: typeLabels[type] ?? type, value: type })),
      },
    ],
    [data],
  );

  return (
    <>
      <AdjustInventoryModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          router.refresh();
        }}
        defaultProductId={product?.id ?? null}
      />
      <ReconciliationImportModal
        isOpen={reconciliationOpen}
        onClose={() => setReconciliationOpen(false)}
        onComplete={() => {
          setReconciliationOpen(false);
          router.refresh();
        }}
        fairContext={fairContext}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-primary">Movimientos de inventario</h1>
          <p className="text-sm text-muted-foreground">Cada cambio de stock, con su motivo y de dónde viene.</p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setReconciliationOpen(true)}>
              <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden="true" />
              Conciliar feria anterior
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Registrar movimiento
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <MetricCard
          label={`Entradas · ${MOVEMENT_SUMMARY_DAYS} días`}
          value={`+${numberFormatter.format(totals.entries)}`}
          note="Recepciones, devoluciones y cargas iniciales"
          icon={<ArrowUp className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-mint"
        />
        <MetricCard
          label={`Salidas · ${MOVEMENT_SUMMARY_DAYS} días`}
          value={`−${numberFormatter.format(totals.exits)}`}
          note="Ventas en línea, mostrador y Mercado Libre"
          icon={<ArrowDown className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-sky"
        />
        <MetricCard
          label={`Ajustes y pérdidas · ${MOVEMENT_SUMMARY_DAYS} días`}
          value={formatSignedQuantity(totals.adjustments)}
          note={describeAdjustmentMix(totals.adjustmentCounts)}
          icon={<SlidersHorizontal className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-cream"
        />
        <MetricCard
          label="Movimientos pendientes"
          value={numberFormatter.format(openIssues)}
          note={openIssues > 0 ? "Líneas que no se pudieron mover" : "Nada pendiente"}
          icon={<TriangleAlert className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-pink"
          tone={openIssues > 0 ? "care" : "default"}
          action={
            openIssues > 0 ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setView("pendientes")}>
                Revisar
              </Button>
            ) : undefined
          }
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" aria-label="Vistas de movimientos" className="flex max-w-full gap-1 overflow-x-auto rounded-full border bg-white p-1">
          {MOVEMENT_VIEWS.map((item) => {
            const active = item.id === view;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setView(item.id)}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "bg-primary text-primary-foreground" : "text-primary hover:bg-accent",
                )}
              >
                {item.label}
                <span className={cn("rounded-full px-1.5 text-xs", active ? "bg-white/20" : "bg-muted")}>{totals.byView[item.id]}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <ProductScanButton
            storeId={storeId}
            compact
            label="Escanear"
            description="Apunta al QR de una etiqueta o al código de barras para abrir su kardex."
            onFound={(found) => router.push(`/${storeId}/movimientos-inventario/producto/${found.id}`)}
          />
          {scope.days !== null ? (
            <Button asChild variant="soft" size="sm">
              <Link href={`${pathname}?todo=1`}>Ver todo el historial</Link>
            </Button>
          ) : null}
        </div>
      </div>

      {reference && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-tint-lavender bg-tint-lavender/30 px-3 py-2 text-sm text-primary">
          <span>
            Mostrando solo los movimientos de <span className="font-semibold">{reference.label ?? `la referencia ${reference.id}`}</span> (
            {numberFormatter.format(data.length)}), sin límite de fecha.
          </span>
          <Link href={pathname} className="inline-flex items-center gap-1 font-semibold hover:underline">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Ver todos
          </Link>
        </div>
      )}
      {product && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-tint-lavender bg-tint-lavender/30 px-3 py-2 text-sm text-primary">
          <span>
            Mostrando solo los movimientos de <span className="font-semibold">{product.name ?? product.id}</span>.
          </span>
          <Link href={`${pathname}/producto/${product.id}`} className="font-semibold hover:underline">
            Ver kardex con saldo
          </Link>
          <Link href={pathname} className="inline-flex items-center gap-1 font-semibold hover:underline">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Ver todos los productos
          </Link>
        </div>
      )}

      {view === "pendientes" ? (
        issuesPanel
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{describeMovementsScope(scope, rows.length)}</p>
          <DataTable
            searchPlaceholder="Buscar producto, SKU, motivo u origen…"
            columns={columns}
            data={rows}
            tableKey={Models.InventoryMovements}
            filters={filters}
            renderMobileCard={(row) => <MovementMobileCard row={row.original} storeId={storeId} />}
            emptyState={{
              title: "Todavía no hay movimientos aquí",
              description:
                view === DEFAULT_MOVEMENT_VIEW
                  ? "Cada venta, recepción o ajuste deja una fila con su motivo y de dónde viene."
                  : "Prueba con otra vista: el movimiento puede estar en «Todo».",
              action: canWrite ? <Button onClick={() => setOpen(true)}>Registrar movimiento</Button> : undefined,
            }}
          />
        </>
      )}
    </>
  );
};
