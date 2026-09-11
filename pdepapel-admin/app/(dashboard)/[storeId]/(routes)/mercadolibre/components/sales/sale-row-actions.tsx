"use client";

import { Loader2, PackageCheck, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSaleAttention } from "@/lib/mercadolibre/sales-views";

import type { MarketplaceSale } from "./sale-types";

export function SaleRowActions({
  sale,
  busySaleId,
  onResync,
  onConfirmReturn,
  className,
}: {
  sale: MarketplaceSale;
  busySaleId: string | null;
  onResync: (sale: MarketplaceSale) => void;
  onConfirmReturn: (sale: MarketplaceSale) => void;
  className?: string;
}) {
  const attention = getSaleAttention(sale);
  if (!attention || attention.kind === "settlement") {
    return attention ? (
      <span className="text-xs text-muted-foreground">{attention.label}</span>
    ) : null;
  }
  const busy = busySaleId === sale.id;
  const Icon = attention.kind === "resync" ? RefreshCw : PackageCheck;
  return (
    <Button
      type="button"
      size="xs"
      variant="soft"
      className={className}
      disabled={busySaleId !== null}
      onClick={() =>
        attention.kind === "resync" ? onResync(sale) : onConfirmReturn(sale)
      }
      data-no-row-click
    >
      {busy ? (
        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Icon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
      )}
      {attention.label}
    </Button>
  );
}
