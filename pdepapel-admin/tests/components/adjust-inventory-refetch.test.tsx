// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Registrar movimiento: el producto elegido se vuelve a leer cada vez que se
 * abre el modal. Se ve «Disponible» (físico − apartados) y, con apartados,
 * «Stock · Apartados»; la cuenta «queda» parte del stock físico, que es lo
 * que cambia un movimiento.
 */
const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("axios", () => ({ default: { post: vi.fn(), get: mocks.get, isAxiosError: () => false } }));
vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1" }), useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/ui/product-scan-button", () => ({ ProductScanButton: () => null }));
vi.mock("@/components/ui/async-product-select", () => ({
  // El buscador real pide la lista por SWR; aquí solo importa que el producto quede elegido.
  AsyncProductSelect: ({ value, onChange }: { value: string; onChange: (id: string, product: unknown) => void }) => (
    <button type="button" data-testid="picker" onClick={() => onChange("p-1", { id: "p-1", name: "Sacapuntas", sku: "SAC-1", stock: 14, reservedUnits: 9 })}>
      {value || "elegir"}
    </button>
  ),
}));

import { AdjustInventoryModal } from "@/app/(dashboard)/[storeId]/(routes)/movimientos-inventario/components/adjust-inventory-modal";

afterEach(() => {
  cleanup();
  mocks.get.mockReset();
});

const modal = (isOpen: boolean) => <AdjustInventoryModal isOpen={isOpen} onClose={() => undefined} onConfirm={() => undefined} defaultProductId="p-1" />;

describe("Registrar movimiento · existencias frescas", () => {
  it("al abrir lee el producto y muestra Disponible, Stock y Apartados; la cuenta parte del físico", async () => {
    mocks.get.mockResolvedValue({ data: { stock: 14, reservedUnits: 9 } });
    const { rerender } = render(modal(true));
    screen.getByTestId("picker").click();
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith("/api/store-1/products/p-1"));
    expect(await screen.findByTestId("adjust-product-stock")).toHaveTextContent("SAC-1 · Disponible 5 · Stock 14 · Apartados 9");
    expect(screen.getByText("14 → 15")).toBeInTheDocument();

    // Se cierra; mientras tanto entra mercancía. Al abrir otra vez se lee de nuevo.
    rerender(modal(false));
    mocks.get.mockResolvedValue({ data: { stock: 23, reservedUnits: 0 } });
    rerender(modal(true));
    screen.getByTestId("picker").click();
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("23 → 24")).toBeInTheDocument();
  });

  it("sin apartados solo dice «Disponible»", async () => {
    mocks.get.mockResolvedValue({ data: { stock: 7, reservedUnits: 0 } });
    render(modal(true));
    screen.getByTestId("picker").click();
    expect(await screen.findByTestId("adjust-product-stock")).toHaveTextContent(/^SAC-1 · Disponible 7$/);
  });
});
