"use client";

import axios from "axios";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";

import type { AsyncProductOption } from "@/components/ui/async-product-select";

/** Lo que imprime el QR de cada etiqueta: `PDP:<id del producto>`. */
const QR_CODE_PATTERN = /^PDP:([a-z0-9-]+)$/i;

export type ScannedCode = { kind: "id"; value: string } | { kind: "code"; value: string };

/** Lo mínimo que se usa de axios, para poder pasar un cliente de prueba. */
export interface ScanHttp {
  get(url: string, config?: { params?: Record<string, string | number> }): Promise<{ data?: unknown }>;
}

export function parseScannedCode(raw: string): ScannedCode | null {
  const code = raw.trim();
  if (!code) return null;
  const match = QR_CODE_PATTERN.exec(code);
  return match ? { kind: "id", value: match[1] } : { kind: "code", value: code };
}

/**
 * Resuelve un código leído (QR de etiqueta, SKU o GTIN) a un producto usando
 * la búsqueda de productos, no el lookup de Vender: aquel responde 409 sin
 * stock, y un producto agotado también necesita etiquetas (por ejemplo al
 * preparar una reposición). Devuelve `null` si nada coincide exactamente.
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
