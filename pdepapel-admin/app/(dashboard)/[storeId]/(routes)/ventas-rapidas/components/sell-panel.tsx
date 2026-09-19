"use client";

import axios from "axios";
import { useParams } from "next/navigation";
import { useMemo, type ReactNode } from "react";

import { SaleDoneCard } from "@/components/sales/sale-done-card";
import { SaleSearch } from "@/components/sales/sale-search";
import { SellPanel as SharedSellPanel, type SellSource } from "@/components/sales/sell-panel";
import { toSaleItems } from "@/lib/sell-cart";

interface SellPanelProps {
  /** Tarjeta de cierre del día, renderizada por el servidor, bajo el cobro. */
  dayClose?: ReactNode;
  storeName?: string;
}

/**
 * Punto de venta: la pantalla compartida con una sola entrada (buscar o
 * escanear), precios con la oferta vigente, efectivo / transferencia con
 * referencia / datáfono Bold, y la tarjeta de después de la venta.
 */
export function SellPanel({ dayClose, storeName }: SellPanelProps) {
  const params = useParams();
  const storeId = String(params.storeId);

  const source = useMemo<SellSource>(
    () => ({
      renderEntry: (add) => <SaleSearch onAdd={add} storeId={storeId} />,
      submit: async ({ lines, paymentMethod, idempotencyKey, transactionId }) => {
        const response = await axios.post(`/api/${storeId}/point-of-sale/sales`, {
          items: toSaleItems(lines),
          paymentMethod,
          idempotencyKey,
          transactionId,
        });
        const order = response.data.order as { id: string; orderNumber: string; paidAt: string | null };
        return {
          orderNumber: order.orderNumber,
          orderId: order.id,
          paidAt: order.paidAt,
          duplicate: Boolean(response.data.duplicate),
          pending: Boolean(response.data.pending),
          terminal: (response.data.terminal as string | null) ?? null,
        };
      },
      paymentOptions: [
        { value: "CASH", title: "Efectivo" },
        { value: "BankTransfer", title: "Transferencia", hint: "Con referencia" },
        { value: "Bold", title: "Datáfono", hint: "Bold confirma" },
      ],
      requireTransferReference: true,
      renderAfterSale: (sale, { reset, update }) => <SaleDoneCard storeId={storeId} storeName={storeName} sale={sale} onNewSale={reset} onChange={update} />,
      copy: {
        addDescription: "Escribe, pega o escanea: nombre, SKU o código de barras. El código exacto entra solo; el precio ya trae la oferta vigente.",
        saleNoun: "venta presencial",
        submitError: "No se registró la venta ni se descontó inventario. Revisa los productos e intenta de nuevo.",
      },
    }),
    [storeId, storeName],
  );

  return <SharedSellPanel source={source} aside={dayClose} persistLastSaleKey={`pos-last-sale:${storeId}`} />;
}
