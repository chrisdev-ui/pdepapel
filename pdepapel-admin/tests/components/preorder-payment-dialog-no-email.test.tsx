// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({ post: vi.fn() }));
const toast = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { ...http, isAxiosError: (error: { isAxiosError?: boolean }) => Boolean(error?.isAxiosError) } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

import { PreorderPaymentDialog } from "@/components/orders/preorder-payment-dialog";

beforeEach(() => {
  http.post.mockResolvedValue({ data: { orderId: "order-1" } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderDialog(customerEmail: string | null) {
  render(
    <PreorderPaymentDialog
      storeId="store-1"
      open
      onOpenChange={() => undefined}
      target={{ mode: "installment", orderId: "order-1" }}
      defaultAmount={100000}
      subjectLabel="el pedido #393"
      customerEmail={customerEmail}
    />,
  );
  fireEvent.change(screen.getByLabelText("Valor recibido"), { target: { value: "20000" } });
}

/**
 * #281: el aviso de la clienta es por correo. Sin correo la casilla no se
 * puede marcar y el mensaje final no dice que se le avisó.
 */
describe("«Avisar a la clienta» en el diálogo de pagos de la preventa", () => {
  it("sin correo: la casilla está apagada, dice «avísale por WhatsApp» y el aviso final lo repite", async () => {
    renderDialog(null);
    const checkbox = screen.getByRole("checkbox", { name: "Avisar a la clienta" });
    expect(checkbox).toBeDisabled();
    expect(screen.getByText("Sin correo: avísale por WhatsApp")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Anotar abono" }));
    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
    expect(http.post.mock.calls[0][1]).toMatchObject({ notifyCustomer: false });
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("No tiene correo: avísale por WhatsApp") })),
    );
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("recibe el aviso por correo") }));
  });

  it("con correo y la casilla marcada: sale el aviso y el mensaje lo dice", async () => {
    renderDialog("clienta@example.com");
    const checkbox = screen.getByRole("checkbox", { name: "Avisar a la clienta" });
    expect(checkbox).toBeEnabled();
    fireEvent.click(checkbox);

    fireEvent.click(screen.getByRole("button", { name: "Anotar abono" }));
    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
    expect(http.post.mock.calls[0][1]).toMatchObject({ notifyCustomer: true });
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: "La clienta recibe el aviso por correo." })));
  });
});
