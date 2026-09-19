// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  scanned: { id: "p-scan", name: "Alcancía de gato", sku: "ALC-01", stock: 4, price: 44000, images: [] },
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1" }),
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
  usePathname: () => "/store-1/productos",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@react-pdf/renderer", () => ({ PDFDownloadLink: () => null }));
vi.mock("@/components/catalog/product-catalog", () => ({ ProductCatalog: () => null }));
vi.mock("@/components/modals/product-batch-import-modal", () => ({ ProductBatchImportModal: () => null }));
vi.mock("@/components/ui/data-table", () => ({ DataTable: ({ searchPlaceholder }: { searchPlaceholder?: string }) => <input aria-label="Buscar" placeholder={searchPlaceholder} /> }));
vi.mock("@/components/ui/product-scan-button", () => ({
  ProductScanButton: ({ onFound, label }: { onFound: (p: unknown) => void; label?: string }) => (
    <button type="button" onClick={() => onFound(mocks.scanned)}>
      {label ?? "Escanear"}
    </button>
  ),
}));

import * as clientModule from "@/app/(dashboard)/[storeId]/(routes)/productos/components/client";

const ProductClient = (clientModule as unknown as { default?: React.ComponentType<never>; ProductClient?: React.ComponentType<never> }).default ??
  (clientModule as unknown as { ProductClient: React.ComponentType<never> }).ProductClient;

afterEach(cleanup);

/**
 * Productos: la búsqueda de la tabla filtra en el cliente lo ya cargado y cada
 * fila abre la ficha, así que una lectura abre directamente la ficha del
 * producto en vez de escribir en el buscador.
 */
describe("Productos · escanear y abrir", () => {
  it("opens the scanned product's detail page instead of filtering the list", async () => {
    const Client = ProductClient as unknown as React.ComponentType<Record<string, unknown>>;
    render(<Client data={[]} suppliers={[]} taxonomies={{ categories: [], sizes: [], colors: [], designs: [] }} lowStockThreshold={null} />);
    expect(screen.getByPlaceholderText("Nombre, SKU, GTIN o grupo…")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Escanear y abrir" }));
    expect(mocks.push).toHaveBeenCalledWith("/store-1/productos/p-scan");
  });
});
