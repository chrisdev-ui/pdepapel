// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scanned: { id: "p-scan", name: "Marcadores Super Golden x12", sku: "MAR-12", stock: 6, price: 39000, acqPrice: 21000, images: [] },
}));

vi.mock("axios", () => ({ default: { post: vi.fn(), patch: vi.fn(), delete: vi.fn(), isAxiosError: () => false } }));
vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1", restockOrderId: "nuevo" }), useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/ui/async-product-select", () => ({
  AsyncProductSelect: ({ value, ariaLabel }: { value: string; ariaLabel?: string }) => <output aria-label={ariaLabel}>{value}</output>,
}));
vi.mock("@/components/ui/product-scan-button", () => ({
  ProductScanButton: ({ onFound, label }: { onFound: (p: unknown) => void; label?: string }) => (
    <button type="button" onClick={() => onFound(mocks.scanned)}>
      {label ?? "Escanear"}
    </button>
  ),
}));

import { RestockOrderDraftForm } from "@/app/(dashboard)/[storeId]/(routes)/aprovisionamiento/[restockOrderId]/components/restock-order-draft-form";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

/** Aprovisionamiento: cada línea del borrador tiene su escáner; la lectura elige el producto y trae su costo. */
describe("Aprovisionamiento · escanear en una línea", () => {
  it("fills the line's product and its acquisition cost from the scan", async () => {
    render(<RestockOrderDraftForm initialData={null} suppliers={[{ id: "s1", name: "Proveedor", leadTimeDays: null }]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Agregar producto" }));
    fireEvent.click(await screen.findByRole("button", { name: "Escanear producto de la línea 1" }));
    expect(screen.getByLabelText("Producto de la línea 1").textContent).toBe("p-scan");
    expect(screen.getByLabelText("Costo unitario de la línea 1")).toHaveDisplayValue(/21[.,]000/);
  });
});
