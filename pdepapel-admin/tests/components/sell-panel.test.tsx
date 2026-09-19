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

/** Hay dos botones «Registrar pago»: el de la tarjeta (escritorio) y el de la barra fija (celular y tableta). */
const registerButtons = () => screen.getAllByRole("button", { name: "Registrar pago" });

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
    fireEvent.click(registerButtons()[0]);
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
    // Con la venta vacía no hay barra fija: solo el botón de la tarjeta, y apagado.
    expect(registerButtons()).toHaveLength(1);
    expect(registerButtons()[0]).toBeDisabled();
  });

  it("keeps the toast for sources without an after-sale card (Ferias)", async () => {
    render(<SellPanel source={makeSource()} />);
    await addCode("LIB-1");
    expect(screen.queryByRole("radio", { name: /Datáfono/ })).not.toBeInTheDocument();
    fireEvent.click(registerButtons()[0]);
    fireEvent.click(screen.getByRole("button", { name: "Sí, registrar pago" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Venta registrada" })));
  });

  it("uses the single entry slot instead of the code box and the picker", () => {
    const renderEntry = vi.fn((add: (line: ReturnType<typeof productLine>) => void) => (
      <button type="button" onClick={() => add(productLine({ productId: "p-7", name: "Washi", price: 3000, maxQuantity: null }))}>Buscar o escanear</button>
    ));
    render(<SellPanel source={makeSource({ renderEntry, renderPicker: () => <p>No debería verse</p> })} />);
    expect(screen.queryByLabelText("Código de barras o QR")).not.toBeInTheDocument();
    expect(screen.queryByText("No debería verse")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Buscar o escanear" }));
    expect(screen.getByLabelText("Productos en la venta")).toHaveTextContent("Washi");
  });

  it("shows variant chips, the offer before/after, the kit deduction and the savings in the total", () => {
    const line = productLine({ productId: "p-1", name: "Kit fresas", price: 8000, originalPrice: 10000, offerLabel: "20% OFF", chips: ["Rosa", "Kit"], note: "Descuenta 2 × Washi", maxQuantity: 5 });
    render(<SellPanel source={makeSource({ renderEntry: (add) => <button type="button" onClick={() => add(line)}>add</button> })} />);
    fireEvent.click(screen.getByRole("button", { name: "add" }));
    fireEvent.click(screen.getByRole("button", { name: "Aumentar cantidad" }));
    const cart = screen.getByLabelText("Productos en la venta");
    expect(cart).toHaveTextContent("Rosa");
    expect(cart).toHaveTextContent("Kit");
    expect(cart).toHaveTextContent("20% OFF");
    expect(cart).toHaveTextContent("antes $ 10.000");
    expect(cart).toHaveTextContent("Descuenta 2 × Washi");
    expect(cart).toHaveTextContent("$ 16.000");
    expect(screen.getByText(/ahorra \$ 4\.000 con las ofertas vigentes/)).toBeInTheDocument();
  });

  it("requires a transfer reference of at least four characters and sends it with the sale", async () => {
    const source = makeSource({ requireTransferReference: true, paymentOptions: [{ value: "CASH", title: "Efectivo" }, { value: "BankTransfer", title: "Transferencia" }, { value: "Bold", title: "Datáfono" }] });
    render(<SellPanel source={source} />);
    await addCode("LIB-1");
    fireEvent.click(screen.getByRole("radio", { name: /Transferencia/ }));
    fireEvent.click(registerButtons()[0]);
    const confirm = screen.getByRole("button", { name: "Sí, registrar pago" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Referencia de la transferencia"), { target: { value: "123" } });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Referencia de la transferencia"), { target: { value: " 1234 " } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(source.submit).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: "BankTransfer", transactionId: "1234" })));
  });

  it("explains the card terminal and confirms with «enviar al datáfono»", async () => {
    const source = makeSource({ paymentOptions: [{ value: "CASH", title: "Efectivo" }, { value: "Bold", title: "Datáfono" }] });
    render(<SellPanel source={source} />);
    await addCode("LIB-1");
    fireEvent.click(screen.getByRole("radio", { name: /Datáfono/ }));
    expect(screen.getByText(/El cobro se envía al datáfono Bold/)).toBeInTheDocument();
    fireEvent.click(registerButtons()[0]);
    expect(screen.getByText("¿Enviar el cobro al datáfono?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sí, enviar al datáfono" }));
    await waitFor(() => expect(source.submit).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: "Bold", transactionId: undefined })));
  });

  it("replaces the floating toast with the after-sale card and starts the next sale from it", async () => {
    const renderAfterSale = vi.fn((sale: { orderNumber: string; total: number; undone?: boolean }, actions: { reset: () => void; update: (patch: { undone?: boolean }) => void }) => (
      <div data-testid="done" data-undone={String(Boolean(sale.undone))}>
        {sale.orderNumber} · {sale.total}
        <button type="button" onClick={() => actions.update({ undone: true })}>Marcar deshecha</button>
        <button type="button" onClick={actions.reset}>Nueva venta</button>
      </div>
    ));
    const source = makeSource({ renderAfterSale, submit: vi.fn(async () => ({ orderNumber: "V-9", orderId: "o-9" })) });
    render(<SellPanel source={source} />);
    await addCode("LIB-1");
    fireEvent.click(registerButtons()[0]);
    fireEvent.click(screen.getByRole("button", { name: "Sí, registrar pago" }));
    await screen.findByTestId("done");
    expect(screen.getByTestId("done")).toHaveTextContent("V-9 · 12000");
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Venta registrada" }));
    expect(screen.queryByText("Aún no hay productos en esta venta.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Marcar deshecha" }));
    expect(screen.getByTestId("done")).toHaveAttribute("data-undone", "true");
    fireEvent.click(screen.getByRole("button", { name: "Nueva venta" }));
    expect(screen.queryByTestId("done")).not.toBeInTheDocument();
    expect(screen.getByText("Aún no hay productos en esta venta.")).toBeInTheDocument();
  });

  it("shows one clear message when the sale fails, never the technical one", async () => {
    const error = Object.assign(new Error("409"), { response: { data: { error: "No alcanzó el inventario: Libreta (hay 1, pediste 3). No se registró nada; ajusta las cantidades o revisa Inventario." } } });
    render(<SellPanel source={makeSource({ submit: vi.fn(async () => { throw error; }) })} />);
    await addCode("LIB-1");
    fireEvent.click(registerButtons()[0]);
    fireEvent.click(screen.getByRole("button", { name: "Sí, registrar pago" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "No se pudo registrar la venta", description: expect.stringContaining("No alcanzó el inventario: Libreta") })));
    expect(screen.getByLabelText("Productos en la venta")).toBeInTheDocument();
  });

  it("keeps the after-sale card across a remount through sessionStorage and clears it on «Nueva venta»", async () => {
    window.sessionStorage.clear();
    const renderAfterSale = (sale: { orderNumber: string }, actions: { reset: () => void }) => (
      <div data-testid="done">{sale.orderNumber}<button type="button" onClick={actions.reset}>Nueva venta</button></div>
    );
    const source = makeSource({ renderAfterSale, submit: vi.fn(async () => ({ orderNumber: "V-11", orderId: "o-11" })) });
    const first = render(<SellPanel source={source} persistLastSaleKey="pos-last-sale:store-1" />);
    await addCode("LIB-1");
    fireEvent.click(registerButtons()[0]);
    fireEvent.click(screen.getByRole("button", { name: "Sí, registrar pago" }));
    await screen.findByTestId("done");
    expect(JSON.parse(window.sessionStorage.getItem("pos-last-sale:store-1") ?? "{}")).toMatchObject({ orderNumber: "V-11", total: 12000 });
    first.unmount();
    render(<SellPanel source={source} persistLastSaleKey="pos-last-sale:store-1" />);
    expect(await screen.findByTestId("done")).toHaveTextContent("V-11");
    fireEvent.click(screen.getByRole("button", { name: "Nueva venta" }));
    expect(window.sessionStorage.getItem("pos-last-sale:store-1")).toBeNull();
    expect(screen.queryByTestId("done")).not.toBeInTheDocument();
  });
});
