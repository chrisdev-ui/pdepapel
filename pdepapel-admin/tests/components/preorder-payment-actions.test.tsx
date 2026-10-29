// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const post = vi.hoisted(() => vi.fn().mockResolvedValue({ data: {} }));
vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1" }), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("axios", () => ({ default: { post } }));

import { PreorderPaymentActions } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-form/preorder-actions";
import { ViewerAccessProvider } from "@/components/shell/viewer-access";

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
  shippingCost: 0,
  presaleId: "presale-1",
  heldByPresale: true,
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

  it("ni solo lectura ni un pedido normal ven los botones", () => {
    renderAs({}, "viewer");
    renderAs({ paymentPlan: "FULL" });
    renderAs({ status: "PAID" });
    expect(screen.queryByRole("button", { name: /Marcar (anticipo|saldo) recibido/ })).toBeNull();
  });
});
