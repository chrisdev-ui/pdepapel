// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scanned: { id: "p-scan", name: "Washi tape nube", sku: "WAS-1", stock: 0, price: 6500, images: [] },
}));

vi.mock("axios", () => ({ default: { post: vi.fn(), isAxiosError: () => false } }));
vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1" }), useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/ui/async-product-select", () => ({
  AsyncProductSelect: ({ value }: { value: string }) => <output data-testid="picker-value">{value}</output>,
}));
vi.mock("@/components/ui/product-scan-button", () => ({
  ProductScanButton: ({ onFound }: { onFound: (p: unknown) => void }) => (
    <button type="button" onClick={() => onFound(mocks.scanned)}>
      Escanear
    </button>
  ),
}));

import { AdjustInventoryModal } from "@/app/(dashboard)/[storeId]/(routes)/movimientos-inventario/components/adjust-inventory-modal";

afterEach(cleanup);

/** Movimientos de inventario: la lectura deja el producto elegido en el ajuste. */
describe("Ajuste de inventario · escanear", () => {
  it("fills the product of the adjustment with the scanned product", async () => {
    render(<AdjustInventoryModal isOpen onClose={() => undefined} onConfirm={() => undefined} products={[]} />);
    expect((await screen.findByTestId("picker-value")).textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Escanear" }));
    expect(screen.getByTestId("picker-value").textContent).toBe("p-scan");
  });
});
