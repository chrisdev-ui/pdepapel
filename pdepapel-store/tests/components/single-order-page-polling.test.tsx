/* @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: null as string | null, token: null as string | null }));
const http = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ userId: session.userId, getToken: async () => session.token }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/pedido/order-1",
}));
vi.mock("axios", () => ({ default: { get: http.get } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));
vi.mock("@/hooks/use-confetti", () => ({ useConfetti: () => ({ fireConfetti: vi.fn() }) }));
vi.mock("@/hooks/use-checkout-order", () => ({ default: () => ({ mutate: vi.fn(), status: "idle" }) }));
vi.mock("@/hooks/use-track-shipment", () => ({ default: () => ({ mutate: vi.fn(), status: "idle" }) }));
vi.mock("@/components/order-account-claim-card", () => ({ OrderAccountClaimCard: () => null }));
vi.mock("@/components/bold-checkout-button", () => ({ BoldCheckoutButton: () => null }));
vi.mock("@/components/bank-transfer-instructions", () => ({ BankTransferInstructions: () => null }));
vi.mock("../../app/(routes)/pedido/[orderId]/components/order-items-card", () => ({ OrderItemsCard: () => null }));
vi.mock("../../app/(routes)/pedido/[orderId]/components/order-timeline", () => ({ OrderTimeline: () => null }));
vi.mock("../../app/(routes)/pedido/[orderId]/components/order-help-card", () => ({ OrderHelpCard: () => null }));

import SingleOrderPage from "@/app/(routes)/pedido/[orderId]/components/single-order-page";
import { OrderStatus } from "@/constants";

import { fullReceiptOrder, maskedReceiptOrder } from "../fixtures/receipt-orders";

const pendingFull = () => fullReceiptOrder({ status: OrderStatus.PENDING, paymentResult: "pending", paidAt: null, userId: "user_1", guestId: null });

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} unobserve() {} });
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://admin.test/api/store-1");
  http.get.mockReset();
  session.userId = null;
  session.token = null;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("sondeo del estado en la página del pedido", () => {
  it("con sesión, el sondeo manda el token: un pedido de cuenta sigue actualizándose", async () => {
    session.userId = "user_1";
    session.token = "token-de-prueba";
    http.get.mockResolvedValue({ data: fullReceiptOrder({ userId: "user_1", guestId: null }) });

    render(<SingleOrderPage order={pendingFull()} />);

    await waitFor(() => expect(http.get).toHaveBeenCalled());
    expect(http.get.mock.calls[0][1]).toMatchObject({ headers: { Authorization: "Bearer token-de-prueba" } });
    expect((await screen.findAllByText(/En camino/)).length).toBeGreaterThan(0);
  });

  it("sin sesión no se inventa un encabezado", async () => {
    http.get.mockResolvedValue({ data: null });

    render(<SingleOrderPage order={pendingFull()} />);

    await waitFor(() => expect(http.get).toHaveBeenCalled());
    expect(http.get.mock.calls[0][1]).toEqual({ headers: {} });
  });

  it("si el sondeo trae el recibo recortado, la dirección completa se queda y el estado avanza", async () => {
    http.get.mockResolvedValue({ data: maskedReceiptOrder({ status: OrderStatus.PAID, paymentResult: "approved" }) });

    render(<SingleOrderPage order={pendingFull()} />);

    expect((await screen.findAllByText(/En camino/)).length).toBeGreaterThan(0);
    const address = document.querySelector("address") as HTMLElement;
    expect(address).toHaveTextContent("Ana María Prueba");
    expect(address).toHaveTextContent("Calle Prueba 1");
    expect(screen.queryByText(/no muestra la dirección completa/)).not.toBeInTheDocument();
  });
});
