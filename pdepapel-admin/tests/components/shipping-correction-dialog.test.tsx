// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShippingCorrectionDialog } from "@/app/(dashboard)/[storeId]/(routes)/aprovisionamiento/[restockOrderId]/components/shipping-correction-dialog";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), toast: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1", restockOrderId: "po-1" }),
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }),
}));
vi.mock("axios", () => ({ default: { post: vi.fn(), isAxiosError: (e: unknown) => Boolean((e as { isAxiosError?: boolean })?.isAxiosError) } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

const order = { id: "po-1", orderNumber: "PO-0036", shippingCost: 6000 };
const plan = {
  shippingBefore: 6000,
  shippingAfter: 7000,
  changed: 1,
  lines: [
    { productId: "p1", name: "Cuaderno azul", received: 2, shareBefore: 3000, shareAfter: 3500, costBefore: 18000, costAfter: 18500, skipped: null },
    { productId: "p2", name: "Resaltadores", received: 3, shareBefore: 200, shareAfter: 200, costBefore: 10200, costAfter: 10200, skipped: "No se cambia: su costo actual viene de una compra más reciente (PO-0040)." },
  ],
};
const url = "/api/store-1/restock-orders/po-1/shipping-correction";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

async function previewWith(value: string) {
  fireEvent.change(screen.getByLabelText("Envío real de la compra"), { target: { value } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Ver cambios" }));
  });
  await screen.findAllByRole("heading", { name: /^(Cambian|No se cambian) \(/ });
  return screen.queryByRole("list", { name: "Cambios por producto" }) as HTMLElement;
}

describe("ShippingCorrectionDialog", () => {
  it("muestra por producto el envío y el costo de hoy y el nuevo, y confirma con lo que mostró", async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: plan }).mockResolvedValueOnce({ data: { ...plan, changed: 1 } });
    const onOpenChange = vi.fn();
    render(<ShippingCorrectionDialog order={order} open onOpenChange={onOpenChange} />);
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();

    const list = await previewWith("7000");
    expect(vi.mocked(axios.post).mock.calls[0]).toEqual([url, { shippingCost: 7000 }]);
    const [changed] = within(list).getAllByRole("listitem");
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(changed).toHaveTextContent("Cuaderno azul");
    expect(changed).toHaveTextContent(/\$\s3\.000.*\$\s3\.500/);
    expect(changed).toHaveTextContent(/\$\s18\.000.*\$\s18\.500/);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar en 1 producto" }));
    });
    await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(2));
    expect(vi.mocked(axios.post).mock.calls[1]).toEqual([
      url,
      { shippingCost: 7000, confirm: true, expected: [{ productId: "p1", transportationCost: 3000 }, { productId: "p2", transportationCost: 200 }] },
    ]);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Envío corregido en 1 producto.", variant: "success" }));
    expect(mocks.refresh).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("cambiar el valor descarta la vista previa: no se confirma algo que no se vio", async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: plan });
    render(<ShippingCorrectionDialog order={order} open onOpenChange={vi.fn()} />);
    await previewWith("7000");
    fireEvent.change(screen.getByLabelText("Envío real de la compra"), { target: { value: "9000" } });
    expect(screen.queryByRole("list", { name: "Cambios por producto" })).toBeNull();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  });

  it("si un costo cambió desde la vista previa (409), avisa y pide verla de nuevo", async () => {
    vi.mocked(axios.post)
      .mockResolvedValueOnce({ data: plan })
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 409, data: { error: "El costo de algún producto cambió desde la vista previa. Ábrela de nuevo." } } });
    const onOpenChange = vi.fn();
    render(<ShippingCorrectionDialog order={order} open onOpenChange={onOpenChange} />);
    await previewWith("7000");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar en 1 producto" }));
    });
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "default" })));
    expect(screen.queryByRole("list", { name: "Cambios por producto" })).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("si con ese envío no cambia nada, no deja confirmar", async () => {
    const same = { ...plan, shippingAfter: 6000, lines: [{ ...plan.lines[0], shareAfter: 3000, costAfter: 18000 }], changed: 0 };
    vi.mocked(axios.post).mockResolvedValueOnce({ data: same });
    render(<ShippingCorrectionDialog order={order} open onOpenChange={vi.fn()} />);
    await previewWith("6000");
    expect(screen.getByText("Con este envío no cambia nada.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  });

  it("con el campo vacío no hay vista previa: vacío no es $ 0", () => {
    render(<ShippingCorrectionDialog order={order} open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Envío real de la compra"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Ver cambios" })).toBeDisabled();
  });

  it("si solo cambia el envío del pedido, el aviso lo dice", async () => {
    const onlyOrder = { ...plan, lines: [plan.lines[1]], changed: 0 };
    vi.mocked(axios.post).mockResolvedValueOnce({ data: onlyOrder }).mockResolvedValueOnce({ data: onlyOrder });
    render(<ShippingCorrectionDialog order={order} open onOpenChange={vi.fn()} />);
    await previewWith("7000");
    expect(screen.getByText(/Ningún producto cambia; solo el envío del pedido/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    });
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Envío del pedido corregido; ningún producto cambió." })));
  });

  it("lo que no se cambia va en su propio grupo, con el motivo en una frase", async () => {
    const mixed = {
      ...plan,
      lines: [
        plan.lines[0],
        plan.lines[1],
        { productId: "p3", name: "Kit escolar", received: 1, shareBefore: null, shareAfter: null, costBefore: 20000, costAfter: 20000, skipped: "No se cambia: es un kit; su costo sale de sus piezas." },
        { productId: "p4", name: "Notas", received: 4, shareBefore: 50, shareAfter: 50, costBefore: 1050, costAfter: 1050, skipped: null },
      ],
    };
    vi.mocked(axios.post).mockResolvedValueOnce({ data: mixed });
    render(<ShippingCorrectionDialog order={order} open onOpenChange={vi.fn()} />);
    const changing = await previewWith("7000");
    expect(within(changing).getAllByRole("listitem").map((item) => item.querySelector("div")?.textContent)).toEqual(["Cuaderno azul"]);
    expect(screen.getByRole("heading", { name: "Cambian (1)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No se cambian (3)" })).toBeInTheDocument();
    const skipped = within(screen.getByRole("list", { name: "Productos que no se cambian" })).getAllByRole("listitem");
    expect(skipped.map((item) => item.textContent)).toEqual([
      "Resaltadores3 unidades recibidasNo se cambia: su costo actual viene de una compra más reciente (PO-0040).",
      "Kit escolar1 unidad recibidaNo se cambia: es un kit; su costo sale de sus piezas.",
      expect.stringMatching(/^Notas4 unidades recibidasSin cambio: ya tiene \$\s50 de envío por unidad\.$/),
    ]);
    expect(screen.getByRole("button", { name: "Confirmar en 1 producto" })).toBeEnabled();
  });
});
