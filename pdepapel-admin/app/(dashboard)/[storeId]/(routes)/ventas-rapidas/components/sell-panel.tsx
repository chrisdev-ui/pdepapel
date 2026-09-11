"use client";

import axios from "axios";
import { useParams } from "next/navigation";
import { useMemo, type ReactNode } from "react";

import { SellPanel as SharedSellPanel, type SellLine, type SellSource } from "@/components/sales/sell-panel";
import { AsyncProductSelect, type AsyncProductOption } from "@/components/ui/async-product-select";
import { productLine, toSaleItems } from "@/lib/sell-cart";

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

/** En el punto de venta toda línea es un producto del catálogo (los kits descuentan sus componentes). */
export function toSellLine(product: PointOfSaleProduct): SellLine {
  return productLine({
    productId: product.id,
    name: product.name,
    detail: `${product.isKit ? "Kit" : "Producto"} · SKU ${product.sku} · ${product.stock} disponibles`,
    price: product.price,
    maxQuantity: product.stock,
    imageUrl: product.images[0]?.url ?? null,
  });
}

const OUT_OF_STOCK_HINT = "Sin stock en línea. Revisa en Inventario.";

/** El lookup responde 409 con `details.code = "OUT_OF_STOCK"` cuando el producto existe pero no tiene unidades. */
function describeLookupError(error: unknown): unknown {
  const response = (error as { response?: { status?: number; data?: { details?: { code?: string } } } })?.response;
  if (response?.status === 409 && response.data?.details?.code === "OUT_OF_STOCK") {
    return Object.assign(new Error(OUT_OF_STOCK_HINT), { response: { data: { error: OUT_OF_STOCK_HINT } } });
  }
  return error;
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
        try {
          const response = await axios.get(`/api/${storeId}/point-of-sale/lookup`, { params: { code } });
          return toSellLine(response.data.product as PointOfSaleProduct);
        } catch (error) {
          throw describeLookupError(error);
        }
      },
      submit: async ({ lines, paymentMethod, idempotencyKey }) => {
        const response = await axios.post(`/api/${storeId}/point-of-sale/sales`, {
          items: toSaleItems(lines),
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
        addDescription: "Escanea el QR o busca por nombre o SKU en el catálogo. El stock que ves es el de este momento.",
        saleNoun: "venta presencial",
      },
    }),
    [storeId],
  );

  return <SharedSellPanel source={source} aside={dayClose} />;
}
