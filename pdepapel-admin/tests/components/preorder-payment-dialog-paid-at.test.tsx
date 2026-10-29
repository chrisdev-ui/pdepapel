// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({ post: vi.fn() }));
const toast = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { ...http, isAxiosError: (error: { isAxiosError?: boolean }) => Boolean(error?.isAxiosError) } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

import { PreorderPaymentDialog } from "@/components/orders/preorder-payment-dialog";

// 00:14 en Bogotá del 29: el mediodía de «hoy» todavía no llega.
const NOW = new Date("2026-10-29T05:14:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  http.post.mockResolvedValue({ data: { orderId: "order-1" } });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

function renderDialog(mode: "deposit" | "balance") {
  render(
    <PreorderPaymentDialog
      storeId="store-1"
      open
      onOpenChange={() => undefined}
      target={mode === "deposit" ? { mode, presaleId: "presale-1", source: { kind: "waitlist", entryId: "entry-1" } } : { mode, orderId: "order-1" }}
      defaultAmount={mode === "deposit" ? 30000 : 130000}
      subjectLabel="Clienta Uno"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: mode === "deposit" ? "Anotar anticipo" : "Anotar saldo" }));
}

const sentPaidAt = () => String(http.post.mock.calls[0][1].paidAt);

/**
 * Paula anota el anticipo de hoy a primera hora: la fecha del pago no puede
 * salir en el futuro, porque el servidor la rechaza («no puede estar en el
 * futuro») y el diálogo se queda abierto (2026-10-29, recorrido local).
 */
describe("fecha del pago al anotar anticipo o saldo", () => {
  it.each(["deposit", "balance"] as const)("%s con la fecha de hoy antes del mediodía: sale la hora actual y el servidor la acepta", async (mode) => {
    renderDialog(mode);
    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
    expect(new Date(sentPaidAt()).getTime()).toBe(NOW.getTime());
    // La regla de parseManualPaymentBody: nada más de 5 minutos adelante.
    expect(new Date(sentPaidAt()).getTime()).toBeLessThanOrEqual(NOW.getTime() + 5 * 60_000);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" })));
  });

  it("un día anterior sigue yendo al mediodía de ese día en Bogotá", async () => {
    render(
      <PreorderPaymentDialog
        storeId="store-1"
        open
        onOpenChange={() => undefined}
        target={{ mode: "deposit", presaleId: "presale-1", source: { kind: "waitlist", entryId: "entry-1" } }}
        defaultAmount={30000}
        subjectLabel="Clienta Uno"
      />,
    );
    fireEvent.change(screen.getByLabelText("Fecha del pago"), { target: { value: "2026-10-27" } });
    fireEvent.click(screen.getByRole("button", { name: "Anotar anticipo" }));
    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
    expect(sentPaidAt()).toBe("2026-10-27T12:00:00-05:00");
  });
});
