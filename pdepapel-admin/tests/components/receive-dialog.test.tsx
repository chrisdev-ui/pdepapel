// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReceiveDialog, type ReceivableOrder } from "@/app/(dashboard)/[storeId]/(routes)/aprovisionamiento/[restockOrderId]/components/receive-dialog";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1", restockOrderId: "po-1" }),
  useRouter: () => ({ refresh, push: vi.fn() }),
}));
vi.mock("axios", () => ({ default: { post: vi.fn(), isAxiosError: (e: unknown) => Boolean((e as { isAxiosError?: boolean })?.isAxiosError) } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const order: ReceivableOrder = {
  id: "po-1",
  orderNumber: "PO-0036",
  totalAmount: 60000,
  shippingCost: 6000,
  items: [
    { id: "l1", productId: "p1", quantity: 2, quantityReceived: 1, cost: 15000, product: { name: "Cuaderno azul", sku: "CUA-AZU", acqPrice: 14000 } },
    { id: "l2", productId: "p2", quantity: 3, quantityReceived: 3, cost: 10000, product: { name: "Resaltadores", sku: "RES-1", acqPrice: 10000 } },
  ],
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("ReceiveDialog", () => {
  it("proposes what is still owed, shows the landed cost and sends one stable idempotency key", async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { status: "COMPLETED" } });
    render(<ReceiveDialog order={order} open onOpenChange={vi.fn()} />);

    const first = screen.getByLabelText("Unidades a recibir de Cuaderno azul") as HTMLInputElement;
    const second = screen.getByLabelText("Unidades a recibir de Resaltadores") as HTMLInputElement;
    expect(first.value).toBe("1");
    expect(second.value).toBe("0");
    expect(screen.getByText("$ 16.500")).toBeInTheDocument();
    expect(screen.getByText(/se crearán 1 movimiento de inventario/i)).toBeInTheDocument();

    const button = screen.getByRole("button", { name: "Recibir 1 unidad" });
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
    const [url, body] = vi.mocked(axios.post).mock.calls[0];
    expect(url).toBe("/api/store-1/restock-orders/po-1/receive");
    expect(body).toMatchObject({ updateCosts: true, assignSupplier: true, lines: [{ restockOrderItemId: "l1", quantity: 1, allowExcess: false }] });
    expect(typeof (body as { idempotencyKey: string }).idempotencyKey).toBe("string");
    expect((body as { idempotencyKey: string }).idempotencyKey.length).toBeGreaterThanOrEqual(8);
    expect(refresh).toHaveBeenCalled();
  });

  it("blocks an excess until it is confirmed and then flags the line", async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: {} });
    render(<ReceiveDialog order={order} open onOpenChange={vi.fn()} />);

    const input = screen.getByLabelText("Unidades a recibir de Cuaderno azul");
    fireEvent.change(input, { target: { value: "2" } });
    expect(screen.getByText(/1 más de lo pedido/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recibir 2 unidades" })).toBeDisabled();

    fireEvent.click(screen.getByLabelText("Confirmar 1 de más en Cuaderno azul"));
    expect(screen.getByRole("button", { name: "Recibir 2 unidades" })).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Recibir 2 unidades" }));
    });
    await waitFor(() => expect(axios.post).toHaveBeenCalled());
    expect(vi.mocked(axios.post).mock.calls[0][1]).toMatchObject({ lines: [{ restockOrderItemId: "l1", quantity: 2, allowExcess: true }] });
  });

  it("keeps the button locked while the request is in flight and lets the cost update be switched off", async () => {
    let resolve: (value: unknown) => void = () => {};
    vi.mocked(axios.post).mockImplementation(() => new Promise((r) => { resolve = r; }));
    const onOpenChange = vi.fn();
    render(<ReceiveDialog order={order} open onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Recibir 1 unidad" }));
    expect(screen.getByRole("button", { name: /Recibiendo…/ })).toBeDisabled();
    // Un segundo clic no manda otra petición.
    fireEvent.click(screen.getByRole("button", { name: /Recibiendo…/ }));
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(vi.mocked(axios.post).mock.calls[0][1]).toMatchObject({ updateCosts: false });

    await act(async () => {
      resolve({ data: {} });
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
