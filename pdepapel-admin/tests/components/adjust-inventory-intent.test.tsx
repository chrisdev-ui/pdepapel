// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * «Registrar movimiento» pregunta primero qué pasó. Antes pedía «Tipo de
 * Ajuste», luego «Acción», y cuando el tipo ya imponía el signo mostraba un
 * campo de solo lectura llamado «Acción Implícita».
 */
const mocks = vi.hoisted(() => ({
  post: vi.fn(async () => ({ data: {} })),
  toast: vi.fn(),
  scanned: { id: "p-1", name: "Lápiz mecánico 0.5 pastel", sku: "LAP-MEC-05", stock: 37, price: 4200, images: [] },
}));

vi.mock("axios", () => ({ default: { post: mocks.post, isAxiosError: () => false } }));
vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1" }), useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
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

const open = () => render(<AdjustInventoryModal isOpen onClose={() => undefined} onConfirm={() => undefined} />);

afterEach(() => {
  cleanup();
  mocks.post.mockClear();
});

describe("Registrar movimiento · la intención manda", () => {
  it("no usa el vocabulario viejo de la base de datos", () => {
    open();
    expect(screen.queryByText(/Tipo de Ajuste/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Acción Impl/i)).not.toBeInTheDocument();
    expect(screen.getByText("1 · ¿Qué pasó?")).toBeInTheDocument();
  });

  it("cada tarjeta enseña su propio signo", () => {
    open();
    const damage = screen.getByRole("button", { name: /Daño/ });
    expect(damage).toHaveTextContent("−");
    const count = screen.getByRole("button", { name: /Conteo físico/ });
    expect(count).toHaveTextContent("+ o −");
  });

  it("solo el conteo físico deja elegir si suma o resta", () => {
    open();
    expect(screen.getByRole("button", { name: "Sumar" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Daño/ }));
    expect(screen.queryByRole("button", { name: "Sumar" })).not.toBeInTheDocument();
  });

  it("muestra en qué queda el stock antes de registrar", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Escanear" }));
    // Conteo físico, sumando 1 sobre 37 unidades.
    expect(screen.getByText("37 → 38")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restar" }));
    expect(screen.getByText("37 → 36")).toBeInTheDocument();
  });

  it("no deja restar más de lo que hay", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Escanear" }));
    fireEvent.click(screen.getByRole("button", { name: /Pérdida/ }));
    const quantity = screen.getByLabelText("Unidades");
    fireEvent.change(quantity, { target: { value: "99" } });
    expect(screen.getByText("No se puede restar más de lo que hay.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar movimiento" })).toBeDisabled();
  });

  it("el motivo es una categoría y el texto libre queda como nota", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Escanear" }));
    // Sin motivo no se puede registrar.
    expect(screen.getByRole("button", { name: "Registrar movimiento" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reconteo de estante" }));
    fireEvent.change(screen.getByLabelText("Nota (opcional)"), { target: { value: "estante 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar movimiento" }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalled());
    expect(mocks.post).toHaveBeenCalledWith("/api/store-1/inventory", {
      productId: "p-1",
      type: "MANUAL_ADJUSTMENT",
      action: "add",
      quantity: 1,
      reason: "Conteo físico · Reconteo de estante",
      description: "estante 2",
    });
  });

  it("cambiar de intención descarta el motivo anterior", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Escanear" }));
    fireEvent.click(screen.getByRole("button", { name: "Reconteo de estante" }));
    fireEvent.click(screen.getByRole("button", { name: /Obsequio/ }));
    expect(screen.queryByRole("button", { name: "Reconteo de estante" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar movimiento" })).toBeDisabled();
  });
});
