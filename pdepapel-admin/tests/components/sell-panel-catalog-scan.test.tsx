// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  toast: vi.fn(),
  scanned: { id: "p-scan", name: "Cartuchera maleta crema", sku: "CAR-VIN-CRE-S-L-1541", gtin: null, stock: 1, price: 30000, images: [] },
}));

vi.mock("axios", () => ({ default: { get: mocks.get, post: mocks.post, isAxiosError: () => false } }));
vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1" }), useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("next/image", () => ({ default: (props: { alt: string }) => <img alt={props.alt} /> }));
// El lector de la venta (lookup con control de stock) y el de catálogo (búsqueda) son dos botones distintos.
vi.mock("@/components/ui/barcode-scanner", () => ({ BarcodeScanner: () => <button type="button">Escanear (venta)</button> }));
vi.mock("@/components/ui/product-scan-button", () => ({
  ProductScanButton: ({ onFound, label }: { onFound: (p: unknown) => void; label?: string }) => (
    <button type="button" onClick={() => onFound(mocks.scanned)}>
      {label ?? "Escanear"}
    </button>
  ),
}));
vi.mock("@/components/ui/async-product-select", () => ({ AsyncProductSelect: () => <button type="button">Producto del catálogo</button> }));

import { SellPanel } from "@/app/(dashboard)/[storeId]/(routes)/ventas-rapidas/components/sell-panel";

afterEach(cleanup);

/**
 * Vender: escanear junto al selector del catálogo entra por la búsqueda, igual
 * que elegir de la lista, y el carrito aplica su propia regla de stock. El
 * lookup de la venta (409 sin stock) sigue siendo solo del lector de la venta.
 */
describe("Vender · escanear del catálogo", () => {
  it("adds the scanned product to the sale through the catalog path, never the stock-gated lookup", async () => {
    render(<SellPanel />);
    expect(screen.getByRole("button", { name: "Escanear (venta)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Escanear del catálogo" }));
    const cart = await screen.findByRole("list", { name: "Productos en la venta" });
    expect(cart.textContent).toContain("Cartuchera maleta crema");
    expect(mocks.get.mock.calls.some(([url]) => String(url).includes("point-of-sale/lookup"))).toBe(false);
  });
});
