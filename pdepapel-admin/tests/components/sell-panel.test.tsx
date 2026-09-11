// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SellPanel, type SellSource } from "@/components/sales/sell-panel";
import { capsuleLine, productLine } from "@/lib/sell-cart";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), toast: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("next/image", () => ({ default: (props: { alt: string }) => <img alt={props.alt} /> }));
vi.mock("@/components/ui/barcode-scanner", () => ({ BarcodeScanner: () => <button type="button">Escanear</button> }));

afterEach(() => {
  cleanup();
  mocks.refresh.mockReset();
  mocks.toast.mockReset();
});

function makeSource(overrides: Partial<SellSource> = {}): SellSource {
  return {
    lookup: vi.fn(async (code: string) =>
      code.startsWith("CAP-")
        ? capsuleLine({ code, productId: "p-9", price: 15000 })
        : productLine({ productId: "p-1", name: "Libreta", price: 12000, maxQuantity: 3, detail: "SKU LIB-1" }),
    ),
    submit: vi.fn(async () => ({ orderNumber: "ORD-1" })),
    ...overrides,
  };
}

async function addCode(code: string) {
  fireEvent.change(screen.getByLabelText("Código de barras o QR"), { target: { value: code } });
  fireEvent.click(screen.getByRole("button", { name: "Agregar código" }));
  await waitFor(() => expect(screen.getByLabelText("Productos en la venta")).toBeInTheDocument());
}

describe("SellPanel", () => {
  it("renders both sections as SectionCards with the shared stepper and badges", async () => {
    render(<SellPanel source={makeSource()} />);
    expect(screen.getByRole("heading", { name: "Productos" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cobro" })).toBeInTheDocument();
    expect(screen.getByText("Escanea el QR o busca por nombre o SKU. El stock que ves es el de este momento.")).toBeInTheDocument();

    await addCode("LIB-1");
    const stepper = screen.getByRole("spinbutton", { name: "Cantidad de Libreta" });
    expect(stepper).toHaveValue("1");
    fireEvent.click(screen.getByRole("button", { name: "Aumentar cantidad" }));
    expect(stepper).toHaveValue("2");
    expect(screen.getByText("2 unidades")).toBeInTheDocument();

    await addCode("CAP-abc");
    expect(screen.getByText("CAP-ABC")).toBeInTheDocument();
    expect(screen.getByText("1 unidad · cantidad fija")).toBeInTheDocument();
  });

  it("submits lines with an explicit kind and capsule code after confirming", async () => {
    const source = makeSource();
    render(<SellPanel source={source} />);
    await addCode("LIB-1");
    await addCode("CAP-xyz");

    fireEvent.click(screen.getByRole("radio", { name: /Transferencia/ }));
    fireEvent.click(screen.getByRole("button", { name: "Registrar pago" }));
    expect(screen.getByText("¿Confirmar pago?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sí, registrar pago" }));

    await waitFor(() => expect(source.submit).toHaveBeenCalledTimes(1));
    const input = vi.mocked(source.submit).mock.calls[0][0];
    expect(input.paymentMethod).toBe("BankTransfer");
    expect(input.idempotencyKey.length).toBeGreaterThanOrEqual(12);
    expect(input.lines[0]).not.toHaveProperty("capsuleCode");
    expect(input.lines).toEqual([
      expect.objectContaining({ kind: "product", productId: "p-1", quantity: 1 }),
      expect.objectContaining({ kind: "capsule", productId: "p-9", capsuleCode: "CAP-XYZ", quantity: 1 }),
    ]);
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Venta registrada" }));
  });

  it("shows the server message when a lookup fails", async () => {
    const error = Object.assign(new Error("409"), { response: { data: { error: "Sin stock en línea. Revisa en Inventario." } } });
    render(<SellPanel source={makeSource({ lookup: vi.fn(async () => { throw error; }) })} />);
    fireEvent.change(screen.getByLabelText("Código de barras o QR"), { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar código" }));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Código no disponible", description: "Sin stock en línea. Revisa en Inventario." }),
      ),
    );
  });

  it("locks the sale and explains why", () => {
    render(<SellPanel source={makeSource()} lockedReason="Las ventas están detenidas." />);
    expect(screen.getByRole("status")).toHaveTextContent("Las ventas están detenidas.");
    expect(screen.getByLabelText("Código de barras o QR")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Registrar pago" })).toBeDisabled();
  });
});
