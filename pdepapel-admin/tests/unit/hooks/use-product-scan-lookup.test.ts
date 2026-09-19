import { describe, expect, it, vi } from "vitest";

import { parseScannedCode, resolveScannedProduct } from "@/hooks/use-product-scan-lookup";

const zeroStock = { id: "p-zero", name: "Cartuchera Wisdom", sku: "CAR-AES-ROS-S-L-9090", gtin: "7701234567890", stock: 0, price: 13000 };
const other = { id: "p-other", name: "Cartuchera Wisdom XL", sku: "CAR-AES-ROS-S-L-9090-XL", gtin: null, stock: 4, price: 15000 };

/**
 * Vender resuelve códigos con `/point-of-sale/lookup`, que responde 409 sin
 * stock. Etiquetas no puede usarlo: un producto agotado también se etiqueta
 * (preparar una reposición), así que aquí se pasa por la búsqueda.
 */
describe("resolveScannedProduct", () => {
  const http = (rows: unknown[], detail?: unknown) => ({
    get: vi.fn(async (url: string, _config?: { params?: Record<string, string | number> }) => {
      if (url.includes("/products/search")) return { data: { data: rows, metadata: { hasMore: false } } };
      if (detail) return { data: detail };
      throw new Error("404");
    }),
  });

  it("parses the label QR and plain codes", () => {
    expect(parseScannedCode("PDP:abc-123")).toEqual({ kind: "id", value: "abc-123" });
    expect(parseScannedCode("  CAR-1 ")).toEqual({ kind: "code", value: "CAR-1" });
    expect(parseScannedCode("   ")).toBeNull();
  });

  it("resolves a zero-stock product by exact SKU through the product search, never the Vender lookup", async () => {
    const client = http([other, zeroStock]);
    const product = await resolveScannedProduct("store-1", "car-aes-ros-s-l-9090", client);
    expect(product?.id).toBe("p-zero");
    expect(product?.stock).toBe(0);
    const [url, options] = client.get.mock.calls[0];
    expect(url).toBe("/api/store-1/products/search");
    expect(options).toEqual({ params: { q: "car-aes-ros-s-l-9090", limit: 10 } });
    expect(client.get.mock.calls.some(([called]) => String(called).includes("point-of-sale"))).toBe(false);
  });

  it("resolves by exact GTIN and refuses partial matches", async () => {
    expect((await resolveScannedProduct("store-1", "7701234567890", http([other, zeroStock])))?.id).toBe("p-zero");
    // «9090» aparece dentro de dos SKU pero no es ninguno: nada que elegir.
    expect(await resolveScannedProduct("store-1", "9090", http([other, zeroStock]))).toBeNull();
  });

  it("resolves the label QR by product id and returns null when the id no longer exists", async () => {
    const found = http([], { ...zeroStock, id: "abc-123" });
    expect((await resolveScannedProduct("store-1", "PDP:abc-123", found))?.id).toBe("abc-123");
    expect(found.get).toHaveBeenCalledWith("/api/store-1/products/abc-123");
    expect(await resolveScannedProduct("store-1", "PDP:nadie", http([]))).toBeNull();
  });
});
