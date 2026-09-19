// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  toast: vi.fn(),
  scanned: { id: "p-scan", name: "Agenda Hadas lila", sku: "OF-4", stock: 0, price: 37000, images: [] },
}));

vi.mock("axios", () => ({ default: { get: mocks.get, isAxiosError: () => false } }));
vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1" }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/ui/product-scan-button", () => ({
  ProductScanButton: ({ onFound, label, size }: { onFound: (p: unknown) => void; label?: string; size?: string }) => (
    <button type="button" data-size={size} onClick={() => onFound(mocks.scanned)}>
      {label ?? "Escanear"}
    </button>
  ),
}));

import { ScanIntoGroupButton } from "@/components/products/scan-into-group-button";

const isolatedRow = { id: "p-scan", name: "Agenda Hadas lila", sku: "OF-4", price: 37000, acqPrice: 20000, stock: 0, category: { id: "c1", name: "Agendas" }, size: null, color: { id: "co-lila", name: "Lila", value: "#c9f" }, design: null, images: [{ url: "https://res.cloudinary.com/demo/a.jpg", isMain: true }], productGroupId: null, isArchived: false, slug: "agenda-hadas-lila" };

afterEach(cleanup);
beforeEach(() => {
  mocks.get.mockReset();
  mocks.toast.mockReset();
});

/**
 * Escanear para traer al grupo pregunta al mismo endpoint que «Traer
 * existentes» por el id leído: si el producto ya está en otro grupo o está
 * archivado no vuelve, y se rechaza con la misma regla que la lista. Lo que
 * vuelve entra por el mismo manejador (deduplicación incluida).
 */
describe("Grupo · escanear para traer un producto", () => {
  it("hands an eligible standalone product to the same import handler as the list", async () => {
    mocks.get.mockResolvedValue({ data: { data: [isolatedRow], metadata: { hasMore: false } } });
    const onImport = vi.fn();
    render(<ScanIntoGroupButton onImport={onImport} />);
    const button = screen.getByRole("button", { name: "Escanear producto para traerlo" });
    expect(button).toHaveAttribute("data-size", "sm");
    fireEvent.click(button);
    await waitFor(() => expect(onImport).toHaveBeenCalledWith([isolatedRow]));
    expect(mocks.get).toHaveBeenCalledWith("/api/store-1/search/products/isolated", { params: { id: "p-scan", limit: 1 } });
  });

  it("refuses a product that already belongs to another group or is archived", async () => {
    mocks.get.mockResolvedValue({ data: { data: [], metadata: { hasMore: false } } });
    const onImport = vi.fn();
    render(<ScanIntoGroupButton onImport={onImport} />);
    fireEvent.click(screen.getByRole("button", { name: "Escanear producto para traerlo" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "No se puede traer al grupo", variant: "destructive" })));
    expect(onImport).not.toHaveBeenCalled();
  });

  it("renders nothing while the form is busy", () => {
    render(<ScanIntoGroupButton onImport={() => undefined} disabled />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
