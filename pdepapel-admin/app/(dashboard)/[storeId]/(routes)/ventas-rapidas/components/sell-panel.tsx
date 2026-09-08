"use client";

import axios from "axios";
import { useParams } from "next/navigation";
import { useMemo, type ReactNode } from "react";

import { SellPanel as SharedSellPanel, type SellLine, type SellSource } from "@/components/sales/sell-panel";
import { AsyncProductSelect, type AsyncProductOption } from "@/components/ui/async-product-select";

export type PointOfSaleProduct = {
  id: string;
  name: string;
  sku: string;
  gtin: string | null;
  stock: number;
  price: number;
  isKit: boolean;
  images: { url: string }[];
};

export function toPointOfSaleProduct(product: AsyncProductOption): PointOfSaleProduct {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    gtin: product.gtin || null,
    stock: product.stock,
    price: Number(product.price || 0),
    isKit: Boolean(product.isKit),
    images: product.images || [],
  };
}

export function toSellLine(product: PointOfSaleProduct): SellLine {
  return {
    key: `product-${product.id}`,
    productId: product.id,
    name: product.name,
    detail: `${product.isKit ? "Kit" : "Producto"} · SKU ${product.sku} · ${product.stock} disponibles`,
    price: product.price,
    quantity: 1,
    maxQuantity: product.stock,
    imageUrl: product.images[0]?.url ?? null,
  };
}

interface SellPanelProps {
  /** Tarjeta de cierre del día, renderizada por el servidor, bajo el cobro. */
  dayClose?: ReactNode;
}

/** Punto de venta: la pantalla compartida con el catálogo completo como fuente. */
export function SellPanel({ dayClose }: SellPanelProps) {
  const params = useParams();
  const storeId = String(params.storeId);

  const source = useMemo<SellSource>(
    () => ({
      lookup: async (code) => {
        const response = await axios.get(`/api/${storeId}/point-of-sale/lookup`, { params: { code } });
        return toSellLine(response.data.product as PointOfSaleProduct);
      },
      submit: async ({ lines, paymentMethod, idempotencyKey }) => {
        const response = await axios.post(`/api/${storeId}/point-of-sale/sales`, {
          items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
          paymentMethod,
          idempotencyKey,
        });
        return { orderNumber: response.data.order.orderNumber as string, duplicate: Boolean(response.data.duplicate) };
      },
      renderPicker: (add) => (
        <AsyncProductSelect
          value=""
          onChange={(_value, product) => {
            if (product) add(toSellLine(toPointOfSaleProduct(product)));
          }}
          placeholder="Busca por nombre, SKU o código"
          modal
          ariaLabel="Agregar producto del catálogo"
        />
      ),
      copy: {
        addDescription: "Escanea una etiqueta, escribe el SKU o busca el producto en el catálogo. Cada lectura suma una unidad.",
      },
    }),
    [storeId],
  );

  return <SharedSellPanel source={source} aside={dayClose} />;
}
