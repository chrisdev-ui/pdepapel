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
  AsyncProductSelect: ({ value, ariaLabel, details }: { value: string; ariaLabel?: string; details?: string }) => (
    <output aria-label={ariaLabel} data-details={details}>
      {value}
    </output>
  ),
}));
// Igual que el botón real: con `iconOnly` el nombre queda solo en `aria-label`;
// la instancia `secondary` (sonido y celular de la cabecera) no es un botón de cámara.
vi.mock("@/components/ui/product-scan-button", () => ({
  ProductScanButton: ({ onFound, label, iconOnly, controls }: { onFound: (p: unknown) => void; label?: string; iconOnly?: boolean; controls?: string }) =>
    controls === "secondary" ? null : (
      <button type="button" aria-label={label ?? "Escanear"} onClick={() => onFound(mocks.scanned)}>
        {iconOnly ? null : (label ?? "Escanear")}
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

  it("asks the product selector for the purchase-cost details, not the sale price", async () => {
    render(<RestockOrderDraftForm initialData={null} suppliers={[{ id: "s1", name: "Proveedor", leadTimeDays: null }]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Agregar producto" }));
    expect(screen.getByLabelText("Producto de la línea 1")).toHaveAttribute("data-details", "cost");
  });
});
