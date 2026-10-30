// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const post = vi.hoisted(() => vi.fn().mockResolvedValue({ data: {} }));
vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1" }), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("axios", () => ({ default: { post } }));
const copy = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock("@/hooks/use-clipboard", () => ({ useClipboard: () => ({ onCopy: copy, copied: false }) }));

import { PreorderPaymentActions } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-form/preorder-actions";
import { ViewerAccessProvider } from "@/components/shell/viewer-access";
import { getAmountDueNow, sumPrepaid } from "@/lib/order-payment-amounts";

afterEach(() => {
  cleanup();
  post.mockClear();
});

const base = {
  id: "order-1",
  orderNumber: "ORD-1",
  status: "PENDING",
  paymentPlan: "DEPOSIT",
  depositAmount: 30000,
  total: 160000,
  balanceDue: 130000,
  shippingCost: 0,
  presaleId: "presale-1",
  heldByPresale: true,
  email: "" as string | null,
  fullName: "Clienta Prueba",
  productName: "Calendario de adviento",
  pickup: false,
  unfulfilled: false,
  balanceRequested: false,
};

function renderAs(order: Partial<typeof base>, role: "owner" | "viewer" = "owner") {
  return render(
    <ViewerAccessProvider role={role}>
      <PreorderPaymentActions storeId="store-1" order={{ ...base, ...order }} />
    </ViewerAccessProvider>,
  );
}

/**
 * Los botones de anticipo y saldo en la página del pedido: anticipo pendiente
 * → «Marcar anticipo recibido» con el anticipo y «Avisar» apagado; anticipo
 * recibido → «Marcar saldo recibido», apagado hasta liberar; liberado, el
 * saldo es total − anticipo + envío. Ni la cuenta de solo lectura ni un pedido
 * normal ven nada.
 */
describe("anticipo y saldo en la página del pedido", () => {
  it("pendiente: «Marcar anticipo recibido» anota el anticipo sin avisar por defecto", async () => {
    renderAs({});
    fireEvent.click(screen.getByRole("button", { name: "Marcar anticipo recibido" }));
    expect(screen.getByRole("checkbox", { name: "Avisar a la clienta" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Anotar anticipo" }));
    await vi.waitFor(() => expect(post).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith(
      "/api/store-1/presales/presale-1/deposits",
      expect.objectContaining({ amount: 30000, notifyCustomer: false, method: "BankTransfer", source: { kind: "order", orderId: "order-1" } }),
    );
  });

  it("anticipo recibido sin liberar: «Marcar saldo recibido» apagado", () => {
    renderAs({ status: "DEPOSIT_PAID" });
    expect(screen.queryByRole("button", { name: "Marcar anticipo recibido" })).toBeNull();
    expect(screen.getByRole("button", { name: "Marcar saldo recibido" })).toBeDisabled();
  });

  it("liberado: el saldo es total − anticipo + el envío que se anote", async () => {
    renderAs({ status: "DEPOSIT_PAID", heldByPresale: false });
    fireEvent.click(screen.getByRole("button", { name: "Marcar saldo recibido" }));
    expect(screen.getByText(/Saldo a recibir/).textContent).toMatch(/130\.000/);
    fireEvent.change(screen.getByLabelText("Envío cobrado con el saldo"), { target: { value: "9000" } });
    expect(screen.getByText(/Saldo a recibir/).textContent).toMatch(/139\.000/);
    fireEvent.click(screen.getByRole("button", { name: "Anotar saldo" }));
    await vi.waitFor(() => expect(post).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith("/api/store-1/orders/order-1/balance", expect.objectContaining({ amount: 139000, shippingCost: 9000, notifyCustomer: false }));
  });

  // El pedido …393 (2026-10-29): la clienta pagó $60.000 de anticipo. El
  // saldo sale de lo pagado, como lo calcula el servidor: $100.000 + envío.
  it("con $60.000 pagados el saldo es $100.000 + envío, no total − anticipo", async () => {
    const order = { status: "DEPOSIT_PAID" as const, paymentPlan: "DEPOSIT" as const, total: 160000, depositAmount: 30000, giftCardAmount: 0 };
    const balanceDue = getAmountDueNow(order, sumPrepaid([{ kind: "DEPOSIT", status: "APPROVED", amount: 60000 }]));
    expect(balanceDue).toBe(100000);
    renderAs({ status: "DEPOSIT_PAID", heldByPresale: false, balanceDue });
    fireEvent.click(screen.getByRole("button", { name: "Marcar saldo recibido" }));
    expect(screen.getByText(/Saldo a recibir/).textContent).toMatch(/100\.000/);
    fireEvent.change(screen.getByLabelText("Envío cobrado con el saldo"), { target: { value: "12000" } });
    expect(screen.getByText(/Saldo a recibir/).textContent).toMatch(/112\.000/);
    fireEvent.click(screen.getByRole("button", { name: "Anotar saldo" }));
    await vi.waitFor(() => expect(post).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith("/api/store-1/orders/order-1/balance", expect.objectContaining({ amount: 112000, shippingCost: 12000 }));
  });

  it("esperando la mercancía: «Registrar abono» anota un abono, avisa si pasa de lo que falta y no deja guardarlo", async () => {
    renderAs({ status: "DEPOSIT_PAID", heldByPresale: true, balanceDue: 70000 });
    expect(screen.getByRole("button", { name: "Marcar saldo recibido" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Registrar abono" }));
    expect(screen.getByRole("dialog", { name: "Registrar abono" })).toBeInTheDocument();
    expect(screen.getByText("Falta $ 70.000 + envío.", { normalizer: (text) => text.replace(/\s+/g, " ").trim() })).toBeInTheDocument();
    const value = screen.getByLabelText("Valor recibido");
    fireEvent.change(value, { target: { value: "80000" } });
    expect(screen.getByText(/Pasa de lo que falta: el abono puede ser hasta/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anotar abono" })).toBeDisabled();
    fireEvent.change(value, { target: { value: "20000" } });
    expect(screen.getByRole("checkbox", { name: "Avisar a la clienta" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Anotar abono" }));
    await vi.waitFor(() => expect(post).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith("/api/store-1/orders/order-1/installments", expect.objectContaining({ amount: 20000, notifyCustomer: false, method: "BankTransfer" }));
  });

  it("pagado todo antes de que llegue: «Saldo pagado», sin «Registrar abono»; liberado, el saldo es solo el envío", async () => {
    renderAs({ status: "DEPOSIT_PAID", heldByPresale: true, balanceDue: 0 });
    expect(screen.getByTestId("saldo-pagado")).toHaveTextContent("Saldo pagado");
    expect(screen.queryByRole("button", { name: "Registrar abono" })).toBeNull();
    cleanup();
    renderAs({ status: "DEPOSIT_PAID", heldByPresale: false, balanceDue: 0 });
    expect(screen.queryByRole("button", { name: "Registrar abono" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Marcar saldo recibido" }));
    expect(screen.getByText(/Saldo a recibir/).textContent).toMatch(/\$\s?0/);
    fireEvent.change(screen.getByLabelText("Envío cobrado con el saldo"), { target: { value: "9000" } });
    expect(screen.getByText(/Saldo a recibir/).textContent).toMatch(/9\.000/);
  });

  it("liberado sin pedir saldo: «Pedir saldo» suma el envío, avisa por correo por defecto y deja el enlace para WhatsApp", async () => {
    post.mockResolvedValueOnce({ data: { total: 172000, shipping: 12000, amountDue: 122000, completed: false } });
    renderAs({ status: "DEPOSIT_PAID", heldByPresale: false, balanceDue: 110000, email: "clienta@example.com" });
    expect(screen.queryByTestId("cobrar-saldo")).toBeNull();
    fireEvent.click(screen.getByTestId("pedir-saldo"));
    expect(screen.getByRole("dialog", { name: "Pedir saldo" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Avisar a la clienta" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Pedir saldo" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Envío cotizado"), { target: { value: "12000" } });
    expect(screen.getByTestId("balance-request-preview").textContent).toMatch(/122\.000/);
    fireEvent.click(screen.getByRole("button", { name: "Pedir saldo" }));
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith("/api/store-1/orders/order-1/balance-request", { shippingCost: 12000, notifyCustomer: true }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog", { name: "Pedir saldo" })).toBeNull());
  });

  it("recoge en la tienda y sin correo: envío $ 0, sin casilla de aviso", async () => {
    post.mockResolvedValueOnce({ data: { total: 160000, shipping: 0, amountDue: 110000, completed: false } });
    renderAs({ status: "DEPOSIT_PAID", heldByPresale: false, balanceDue: 110000, pickup: true, email: null });
    fireEvent.click(screen.getByTestId("pedir-saldo"));
    expect(screen.queryByLabelText("Envío cotizado")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Avisar a la clienta" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Pedir saldo" }));
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith("/api/store-1/orders/order-1/balance-request", { shippingCost: 0, notifyCustomer: false }));
  });

  it("saldo pedido: «Cobrar saldo» con lo que falta; «sin unidad» no ofrece pedir saldo", () => {
    renderAs({ status: "DEPOSIT_PAID", heldByPresale: false, balanceDue: 122000, balanceRequested: true, shippingCost: 12000 });
    expect(screen.queryByTestId("pedir-saldo")).toBeNull();
    expect(screen.getByTestId("cobrar-saldo").textContent).toMatch(/Cobrar saldo · \$\s?122\.000/);
    fireEvent.click(screen.getByTestId("cobrar-saldo"));
    expect(screen.getByRole("dialog", { name: "Cobrar saldo" })).toBeInTheDocument();
    expect(screen.getByTestId("balance-collect-amount").textContent).toMatch(/122\.000/);
    fireEvent.click(screen.getByRole("button", { name: /Copiar enlace/ }));
    expect(copy).toHaveBeenCalledWith(expect.stringMatching(/\/pedido\/order-1$/), "Enlace del pedido");
    fireEvent.click(screen.getByRole("button", { name: /Copiar mensaje/ }));
    expect(copy).toHaveBeenLastCalledWith(expect.stringMatching(/^Hola Clienta, ¡ya llegó tu Calendario de adviento! Tu saldo es \$\s?122\.000, con el envío incluido\..*\/pedido\/order-1$/), "Mensaje para WhatsApp");
    // «Cambiar el envío» vuelve a pedir el saldo con el envío nuevo (el anterior ya está en el saldo).
    fireEvent.click(screen.getByRole("button", { name: "Cambiar el envío" }));
    fireEvent.change(screen.getByLabelText("Envío cotizado"), { target: { value: "8000" } });
    expect(screen.getByTestId("balance-request-preview").textContent).toMatch(/118\.000/);
    cleanup();
    renderAs({ status: "DEPOSIT_PAID", heldByPresale: true, unfulfilled: true });
    expect(screen.queryByTestId("pedir-saldo")).toBeNull();
  });

  it("ni solo lectura ni un pedido normal ven los botones", () => {
    renderAs({}, "viewer");
    renderAs({ paymentPlan: "FULL" });
    renderAs({ status: "PAID" });
    expect(screen.queryByRole("button", { name: /Marcar (anticipo|saldo) recibido/ })).toBeNull();
  });
});
