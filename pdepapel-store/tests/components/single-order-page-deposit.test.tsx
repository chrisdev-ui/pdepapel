/* @vitest-environment jsdom */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Monta la página entera: en una máquina cargada el primer render pasa de 5 s.
vi.setConfig({ testTimeout: 30_000 });

const nav = vi.hoisted(() => ({ query: "" }));
const http = vi.hoisted(() => ({ get: vi.fn() }));
const spies = vi.hoisted(() => ({ toast: vi.fn(), confetti: vi.fn() }));

vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ userId: null, getToken: async () => null }) }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/pedido/order-1",
}));
vi.mock("axios", () => ({ default: { get: http.get } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: spies.toast }), toast: spies.toast }));
vi.mock("@/hooks/use-confetti", () => ({ useConfetti: () => ({ fireConfetti: spies.confetti }) }));
vi.mock("@/hooks/use-checkout-order", () => ({ default: () => ({ mutate: vi.fn(), status: "idle" }) }));
vi.mock("@/hooks/use-track-shipment", () => ({ default: () => ({ mutate: vi.fn(), status: "idle" }) }));
vi.mock("@/components/order-account-claim-card", () => ({ OrderAccountClaimCard: () => null }));
vi.mock("@/components/bold-checkout-button", () => ({ BoldCheckoutButton: () => <button type="button">Pagar con Bold</button> }));
vi.mock("@/components/bank-transfer-instructions", () => ({ BankTransferInstructions: () => null }));
vi.mock("../../app/(routes)/pedido/[orderId]/components/order-items-card", () => ({ OrderItemsCard: () => null }));
vi.mock("../../app/(routes)/pedido/[orderId]/components/order-timeline", () => ({ OrderTimeline: () => null }));
vi.mock("../../app/(routes)/pedido/[orderId]/components/order-help-card", () => ({ OrderHelpCard: () => null }));

import SingleOrderPage from "@/app/(routes)/pedido/[orderId]/components/single-order-page";
import { OrderStatus } from "@/constants";
import type { Order } from "@/types";

import { fullReceiptOrder } from "../fixtures/receipt-orders";

const BOLD_RETURN = "?bold-order-id=ORD-1&bold-tx-status=approved";

const toastTitles = () => spies.toast.mock.calls.map(([options]) => options.title as string);
const flush = (ms = 0) => act(async () => {
  await vi.advanceTimersByTimeAsync(ms);
});

const depositOrder = (overrides: Partial<Order> = {}) =>
  fullReceiptOrder({
    status: OrderStatus.DEPOSIT_PAID,
    paymentResult: "approved",
    paymentPlan: "DEPOSIT",
    depositAmount: 30000,
    depositPaidAt: "2026-10-28T10:05:00.000Z",
    paidAt: null,
    total: 160000,
    ...overrides,
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} unobserve() {} });
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://admin.test/api/store-1");
  window.sessionStorage.clear();
  http.get.mockReset();
  spies.toast.mockReset();
  spies.confetti.mockReset();
  nav.query = "";
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("volver de la pasarela con el anticipo de una preventa", () => {
  it("aviso «¡Listo! Recibimos tu anticipo», sin «Pagar ahora» y sin sondear", async () => {
    nav.query = BOLD_RETURN;
    render(<SingleOrderPage order={depositOrder()} />);
    await flush(30_000);

    expect(toastTitles()).toEqual(["¡Listo! Recibimos tu anticipo"]);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("¡Listo! Recibimos tu anticipo");
    expect(screen.queryByRole("button", { name: "Pagar con Bold" })).not.toBeInTheDocument();
    expect(screen.getByTestId("deposit-paid-card")).toHaveTextContent("Preventa apartada");
    expect(http.get).not.toHaveBeenCalled();
  });

  it("pendiente que pasa a DEPOSIT_PAID: deja de sondear y avisa del anticipo", async () => {
    nav.query = BOLD_RETURN;
    http.get.mockResolvedValue({ data: depositOrder() });
    render(<SingleOrderPage order={depositOrder({ status: OrderStatus.PENDING, paymentResult: "pending", depositPaidAt: null })} />);
    await flush();
    expect(http.get).toHaveBeenCalledTimes(1);
    await flush(3_000);
    expect(toastTitles()).toEqual(["¡Listo! Recibimos tu anticipo"]);
    const calls = http.get.mock.calls.length;
    await flush(30_000);
    expect(http.get.mock.calls.length).toBe(calls);
  });
});
