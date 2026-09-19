// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  toast: vi.fn(),
  scanned: { id: "p-scan", name: "Washi tape nube", sku: "WAS-1", stock: 3, price: 6500, images: [] } as Record<string, unknown>,
}));

vi.mock("axios", () => ({ default: { get: mocks.get, isAxiosError: () => false } }));
vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1" }) }));
vi.mock("next/image", () => ({ default: (props: { alt: string }) => <img alt={props.alt} /> }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("swr/infinite", () => ({ default: () => ({ data: undefined, size: 1, setSize: vi.fn(), isLoading: false, isValidating: false }) }));
vi.mock("@/hooks/use-debounce", () => ({ useDebounce: (value: string) => value }));
vi.mock("@/components/ui/product-scan-button", () => ({
  ProductScanButton: ({ onFound, label }: { onFound: (p: unknown) => void; label?: string }) => (
    <button type="button" onClick={() => onFound(mocks.scanned)}>
      {label ?? "Escanear"}
    </button>
  ),
}));

import { ComponentSelector } from "@/app/(dashboard)/[storeId]/(routes)/productos/[productId]/components/component-selector";

const eligibleRow = { id: "p-scan", name: "Washi tape nube", sku: "WAS-1", price: 6500, acqPrice: 2100, stock: 3, images: [{ url: "https://res.cloudinary.com/demo/a.jpg" }], category: { name: "Adhesivos" }, color: { name: "Azul", value: "#9cf" } };

afterEach(cleanup);
beforeEach(() => {
  mocks.get.mockReset();
  mocks.toast.mockReset();
});

/**
 * Escanear un componente pasa por el mismo endpoint que la lista del kit,
 * preguntando por el id leído: kits, archivados y el propio kit no vuelven,
 * así que se rechazan sin repetir la regla en el cliente.
 */
describe("Kit · escanear un componente", () => {
  it("adds an eligible product through the same add path, with quantity 1 and its cost", async () => {
    mocks.get.mockResolvedValue({ data: { products: [eligibleRow], totalItems: 1, totalPages: 1 } });
    const onChange = vi.fn();
    render(<ComponentSelector value={[]} onChange={onChange} excludeId="kit-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Escanear producto para el kit" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(mocks.get).toHaveBeenCalledWith("/api/store-1/products/selectable?id=p-scan&limit=1&excludeId=kit-1");
    expect(onChange.mock.calls[0][0]).toEqual([
      expect.objectContaining({ componentId: "p-scan", quantity: 1, name: "Washi tape nube", sku: "WAS-1", acqPrice: 2100, price: 6500, stock: 3, categoryName: "Adhesivos", colorName: "Azul" }),
    ]);
  });

  it("refuses a product the list would not offer (kit, archived or the kit itself)", async () => {
    mocks.get.mockResolvedValue({ data: { products: [], totalItems: 0, totalPages: 0 } });
    const onChange = vi.fn();
    render(<ComponentSelector value={[]} onChange={onChange} excludeId="kit-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Escanear producto para el kit" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "No puede ser componente", variant: "destructive" })));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not add the same component twice", async () => {
    const onChange = vi.fn();
    render(<ComponentSelector value={[{ componentId: "p-scan", quantity: 2, name: "Washi tape nube" }]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Escanear producto para el kit" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Ya está en el kit" })));
    expect(mocks.get).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("hides the scanner while the form is disabled", () => {
    render(<ComponentSelector value={[]} onChange={() => undefined} disabled />);
    expect(screen.queryByRole("button", { name: "Escanear producto para el kit" })).toBeNull();
  });
});
