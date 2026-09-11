"use client";

import { TintBadge } from "@/components/ui/tint-badge";
import { getInventoryStatusMeta, getSaleStatusMeta } from "@/lib/mercadolibre/order-status";
import { getSaleNetDisplay, getSettlementLabel } from "@/lib/mercadolibre/sales-views";

import { SaleRowActions } from "./sale-row-actions";
import { formatSaleAmount, formatSaleDate, type MarketplaceSale } from "./sale-types";
import { describeSaleItems, SALE_STATUS_TONE, showsInventory } from "./sales-columns";

export function SaleMobileCard({
  sale,
  busySaleId,
  onResync,
  onConfirmReturn,
  highlighted = false,
}: {
  sale: MarketplaceSale;
  busySaleId: string | null;
  onResync: (sale: MarketplaceSale) => void;
  onConfirmReturn: (sale: MarketplaceSale) => void;
  highlighted?: boolean;
}) {
  const status = getSaleStatusMeta(sale.status);
  const inventory = getInventoryStatusMeta(sale.inventoryStatus);
  return (
    <article
      id={`mercadolibre-order-${sale.id}`}
      className={
        highlighted
          ? "flex flex-col gap-2.5 rounded-xl border border-tint-lavender bg-tint-lavender/20 p-3.5 shadow-sm"
          : "flex flex-col gap-2.5 rounded-xl border bg-white p-3.5 shadow-sm"
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-bold text-primary">{sale.externalOrderId}</span>
          <span className="truncate text-xs text-muted-foreground">
            {formatSaleDate(sale.paidAt)}
            {sale.buyerName ? ` · ${sale.buyerName}` : ""}
          </span>
        </div>
        <span className="whitespace-nowrap text-base font-bold text-primary">
          {getSaleNetDisplay(sale, formatSaleAmount)}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{describeSaleItems(sale)}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <TintBadge label={status.label} tone={SALE_STATUS_TONE[sale.status] ?? "slate"} />
        {showsInventory(sale) ? <TintBadge label={inventory.label} tone={inventory.tone} /> : null}
      </div>
      {sale.inventoryError ? (
        <p className="rounded-md border border-tint-pink bg-tint-pink/20 px-2.5 py-1.5 text-xs text-primary" role="status">
          {sale.inventoryError}
        </p>
      ) : null}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Cobrado</dt>
        <dd className="text-right">{formatSaleAmount(sale.totalAmount)}</dd>
        <dt className="text-muted-foreground">Cargos de Mercado Libre</dt>
        <dd className="text-right">
          {sale.marketplaceFee === null
            ? "—"
            : formatSaleAmount((sale.marketplaceFee ?? 0) + (sale.shippingCost ?? 0) + (sale.taxesAmount ?? 0))}
        </dd>
        {sale.refundedAmount && sale.refundedAmount > 0 ? (
          <>
            <dt className="text-muted-foreground">Reembolsado</dt>
            <dd className="text-right">{formatSaleAmount(sale.refundedAmount)}</dd>
          </>
        ) : null}
      </dl>
      <p className="text-xs text-muted-foreground">{getSettlementLabel(sale)}</p>
      <SaleRowActions
        sale={sale}
        busySaleId={busySaleId}
        onResync={onResync}
        onConfirmReturn={onConfirmReturn}
        className="self-start"
      />
    </article>
  );
}
