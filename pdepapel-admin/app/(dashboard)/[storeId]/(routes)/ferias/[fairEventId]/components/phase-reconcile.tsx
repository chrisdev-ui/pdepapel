"use client";

import { ListChecks, PackageX, QrCode, RotateCcw, Undo2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MetricCard } from "@/components/ui/metric-card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import {
  getReconciliationRowState,
  type ReconciliationCount,
  type ReconciliationSummary,
} from "@/lib/fair-phases";

import { TintBadge } from "../../../pedidos/components/order-badges";
import { KitRowDetail } from "./kit-row-detail";

/** Lo que la conciliación necesita de cada renglón de la feria. */
export interface ReconcileItem {
  id: string;
  productId: string;
  allocatedQuantity: number;
  soldQuantity: number;
  packedQuantity: number;
  returnedQuantity: number;
  damagedQuantity: number;
  lostQuantity: number;
  product: { name: string; sku: string };
  /** Piezas de un kit reservado; vacío o ausente en un producto suelto. */
  kitComponents?: { name: string; quantityPerKit: number }[];
}

export interface PhaseReconcileProps {
  storeId: string;
  fairEventId: string;
  items: ReconcileItem[];
  counts: Record<string, ReconciliationCount | undefined>;
  summary: ReconciliationSummary;
  packedCapsules: number;
  canWrite: boolean;
  isReconciling: boolean;
  onChange: (
    productId: string,
    field: keyof ReconciliationCount,
    quantity: number,
  ) => void;
  onAssumeIntact: () => void;
  onClose: () => void;
}

/**
 * La tabla de siete columnas solo cabe desde 1280 px. Las seis fijas suman
 * ~616 px más 72 de separación, y con la barra lateral la tarjeta mide unos
 * 660 px a 1024: ahí el nombre del producto se quedaba sin columna (0 px) y
 * los encabezados se montaban. Medido el 2026-09-26 a 1024, 1280 y 1440.
 *
 * Por debajo de 1280 la fila se lee como tarjeta: nombre y estado en la
 * primera línea, reservadas y vendidas con su rótulo, y los tres conteos en
 * una subcuadrícula de tres con rótulo visible (una sola columna bajo 640 px,
 * donde tres steppers no caben).
 *
 * Las tres columnas de conteo miden 128 px porque el stepper compacto
 * (botón 28 + campo 56 + botón 28 + relleno) mide ~122 px: con 104 los
 * botones «−» y «+» se montaban sobre el número. Las dos cifras de solo
 * lectura (reservadas, vendidas) caben en 64.
 */
const COLUMNS =
  "xl:grid-cols-[minmax(0,1fr)_64px_64px_128px_128px_128px_104px]";

/**
 * Conciliar es **contar**, no confirmar.
 *
 * Las tres columnas arrancan en cero y la cabecera dice cuántas unidades
 * faltan por repartir; el pie dice qué va a pasar al cerrar —cuántas vuelven a
 * bodega, cuántas se dan de baja y cuántas siguen sin contar— y el botón no se
 * enciende hasta que todas las filas cuadran contra «reservado − vendido».
 */
export function PhaseReconcile({
  storeId,
  fairEventId,
  items,
  counts,
  summary,
  packedCapsules,
  canWrite,
  isReconciling,
  onChange,
  onAssumeIntact,
  onClose,
}: PhaseReconcileProps) {
  const toCount = items.reduce(
    (total, item) =>
      total + Math.max(0, item.allocatedQuantity - item.soldQuantity),
    0,
  );
  const counted = Math.max(0, toCount - summary.pending);
  const progress = toCount === 0 ? 100 : Math.round((counted / toCount) * 100);

  return (
    <div className="flex flex-col gap-4">
      {/* Cuánto falta por contar, siempre a la vista. */}
      <div className="flex flex-col gap-3 rounded-xl border border-tint-cream bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:gap-5">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tint-cream">
          <ListChecks className="h-5 w-5 text-primary" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="text-[15px] font-semibold text-primary">
            {summary.pending > 0
              ? `Faltan ${summary.pending} unidades por contar`
              : "Ya contaste todo lo que volvió"}
          </p>
          <p className="text-sm text-muted-foreground">
            Saliste con{" "}
            {items.reduce((total, item) => total + item.allocatedQuantity, 0)} y
            vendiste{" "}
            {items.reduce((total, item) => total + item.soldQuantity, 0)}.
            Cuenta cuántas vuelven buenas, cuántas dañadas y cuántas no
            aparecen.
          </p>
          <div className="flex items-center gap-3">
            <ProgressBar
              percent={progress}
              barClassName={summary.balanced ? "bg-tint-mint" : "bg-[#E5A93C]"}
              className="flex-1"
            />
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {counted} de {toCount}
            </span>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canWrite}
          onClick={onAssumeIntact}
          className="shrink-0"
        >
          Todo volvió intacto
        </Button>
      </div>

      <div
        className={`hidden gap-3 px-2 text-xs font-medium text-muted-foreground xl:grid ${COLUMNS}`}
      >
        <span>Producto</span>
        <span className="text-right">Reservado</span>
        <span className="text-right">Vendido</span>
        <span>Volvió bien</span>
        <span>Dañado</span>
        <span>No apareció</span>
        <span className="text-right">Estado</span>
      </div>

      {items.map((item) => {
        const values = counts[item.productId];
        const state = getReconciliationRowState(item, values);
        const soldOut = state.status === "sold-out";
        return (
          <div
            key={item.id}
            className={`grid gap-3 rounded-lg border p-3 xl:items-center xl:border-0 xl:p-2 ${COLUMNS} ${
              state.status === "untouched"
                ? "border-tint-cream bg-tint-cream/20 xl:bg-transparent"
                : ""
            }`}
          >
            {/* Tarjeta (< xl): nombre y estado en la misma línea. En la tabla, `contents` deshace el grupo y el estado pasa al final. */}
            <div className="flex items-start justify-between gap-3 xl:contents">
              <div className="min-w-0">
                <p className="truncate font-medium">{item.product.name}</p>
                <p className="text-xs text-muted-foreground">
                  SKU {item.product.sku} · Por contar:{" "}
                  <span className="font-semibold text-primary">
                    {state.expected}
                  </span>
                  {item.packedQuantity > 0 &&
                    ` · ${item.packedQuantity} en cápsulas empacadas`}
                </p>
                <KitRowDetail
                  components={item.kitComponents}
                  className="mt-1"
                />
              </div>
              <div className="shrink-0 xl:order-last xl:text-right">
                <TintBadge label={state.label} tone={state.tone} />
              </div>
            </div>
            <div className="flex gap-6 text-sm xl:contents">
              <p className="xl:text-right">
                <span className="mr-1 text-xs text-muted-foreground xl:hidden">
                  Reservadas
                </span>
                {item.allocatedQuantity}
              </p>
              <p className="xl:text-right">
                <span className="mr-1 text-xs text-muted-foreground xl:hidden">
                  Vendidas
                </span>
                {item.soldQuantity}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 xl:contents">
              <div className="grid gap-1">
                <Label className="text-xs xl:sr-only">Volvió bien</Label>
                <StockQuantityInput
                  min={0}
                  size="sm"
                  disabled={soldOut || !canWrite}
                  value={values?.returnedQuantity ?? 0}
                  onChange={(quantity) =>
                    onChange(item.productId, "returnedQuantity", quantity)
                  }
                  ariaLabel={`Unidades que volvieron bien de ${item.product.name}`}
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs xl:sr-only">Dañado</Label>
                <StockQuantityInput
                  min={0}
                  size="sm"
                  disabled={soldOut || !canWrite}
                  value={values?.damagedQuantity ?? 0}
                  onChange={(quantity) =>
                    onChange(item.productId, "damagedQuantity", quantity)
                  }
                  ariaLabel={`Unidades dañadas de ${item.product.name}`}
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs xl:sr-only">No apareció</Label>
                <StockQuantityInput
                  min={0}
                  size="sm"
                  disabled={soldOut || !canWrite}
                  value={values?.lostQuantity ?? 0}
                  onChange={(quantity) =>
                    onChange(item.productId, "lostQuantity", quantity)
                  }
                  ariaLabel={`Unidades perdidas de ${item.product.name}`}
                />
              </div>
            </div>
          </div>
        );
      })}

      {/* Qué va a pasar al cerrar, dicho antes de cerrar. */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <MetricCard
          label="Vuelven a bodega"
          value={summary.returned.toLocaleString("es-CO")}
          note="Se suman otra vez al stock en línea"
          icon={<Undo2 className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-mint"
        />
        <MetricCard
          label="Se dan de baja"
          value={(summary.damaged + summary.lost).toLocaleString("es-CO")}
          note="Dañadas y perdidas: no vuelven al stock"
          icon={<PackageX className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-pink"
        />
        <MetricCard
          label="Sin contar"
          value={summary.pending.toLocaleString("es-CO")}
          note="Reparte estas unidades para poder cerrar"
          icon={<ListChecks className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-cream"
          tone={summary.pending > 0 ? "care" : "default"}
        />
        <MetricCard
          label="Cápsulas que se anulan"
          value={packedCapsules.toLocaleString("es-CO")}
          note="Empacadas y sin vender al cerrar"
          icon={<QrCode className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-lavender"
        />
      </div>

      {packedCapsules > 0 && (
        <p className="text-xs text-muted-foreground">
          Las cápsulas empacadas sin vender se anulan al cerrar. Cuenta su
          producto como devuelto, dañado o perdido en la fila del producto que
          contienen.
        </p>
      )}

      <div className="flex items-start gap-3 rounded-lg border border-tint-cream bg-tint-cream/40 p-3 text-xs leading-relaxed text-primary">
        <RotateCcw className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          <span className="font-semibold">Cerrar es definitivo.</span> Después
          del cierre no se puede reabrir la feria, registrar más ventas ni
          cambiar estas cantidades. Una venta olvidada se corrige después desde{" "}
          <Link
            href={`/${storeId}/movimientos-inventario?feria=${fairEventId}`}
            className="font-semibold underline underline-offset-2"
          >
            Movimientos → Conciliar feria anterior
          </Link>{" "}
          con la plantilla, no desde aquí.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        {!summary.balanced && (
          <p className="text-xs text-muted-foreground sm:mr-auto">
            El botón se enciende cuando las tres columnas sumen lo que falta por
            contar.
          </p>
        )}
        <Button
          type="button"
          onClick={onClose}
          disabled={!canWrite || isReconciling || !summary.balanced}
        >
          Cerrar la feria
        </Button>
      </div>
    </div>
  );
}
