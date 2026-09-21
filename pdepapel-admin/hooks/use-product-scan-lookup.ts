"use client";

import axios from "axios";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";

import type { AsyncProductOption } from "@/components/ui/async-product-select";
// El análisis del código vive en un módulo neutro: la ruta de búsqueda, que es
// de servidor, necesita el mismo patrón y no puede importar este archivo.
import { parseScannedCode, type ScannedCode } from "@/lib/scanned-code";

export { parseScannedCode };
export type { ScannedCode };

/** Lo mínimo que se usa de axios, para poder pasar un cliente de prueba. */
export interface ScanHttp {
  get(url: string, config?: { params?: Record<string, string | number> }): Promise<{ data?: unknown }>;
}

/**
 * Resuelve un código leído (QR de etiqueta, SKU o GTIN) a un producto usando
 * la búsqueda general de productos, no la de Vender: aquella ordena y filtra
 * para el mostrador, y un producto agotado también necesita etiquetas (por
 * ejemplo al preparar una reposición). Devuelve `null` si nada coincide.
 */
export async function resolveScannedProduct(
  storeId: string,
  raw: string,
  http: ScanHttp = axios,
): Promise<AsyncProductOption | null> {
  const parsed = parseScannedCode(raw);
  if (!parsed) return null;
  if (parsed.kind === "id") {
    try {
      const response = await http.get(`/api/${storeId}/products/${encodeURIComponent(parsed.value)}`);
      const product = response.data as Partial<AsyncProductOption> | undefined;
      return product?.id ? (product as AsyncProductOption) : null;
    } catch {
      return null;
    }
  }
  const response = await http.get(`/api/${storeId}/products/search`, { params: { q: parsed.value, limit: 10 } });
  const candidates = ((response.data as { data?: AsyncProductOption[] } | undefined)?.data ?? []) as AsyncProductOption[];
  const wanted = parsed.value.toLowerCase();
  return (
    candidates.find((product) => product.sku?.toLowerCase() === wanted) ??
    candidates.find((product) => product.gtin?.toLowerCase() === wanted) ??
    null
  );
}

/**
 * Escanear para encontrar: cualquier pantalla con un buscador de productos
 * puede colgar un botón de cámara y pasar aquí lo leído.
 */
export function useProductScanLookup(storeIdOverride?: string) {
  const params = useParams();
  const storeId = storeIdOverride ?? String(params?.storeId ?? "");
  const [resolving, setResolving] = useState(false);

  const resolve = useCallback(
    async (raw: string) => {
      setResolving(true);
      try {
        return await resolveScannedProduct(storeId, raw);
      } finally {
        setResolving(false);
      }
    },
    [storeId],
  );

  return { resolve, resolving };
}
