/* @vitest-environment jsdom */

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ userId: null, getToken: async () => null }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/pedido/order-1",
}));
vi.mock("axios", () => ({ default: { get: vi.fn().mockResolvedValue({ data: {} }) } }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));
vi.mock("@/hooks/use-confetti", () => ({ useConfetti: () => ({ fireConfetti: vi.fn() }) }));
vi.mock("@/hooks/use-checkout-order", () => ({ default: () => ({ mutate: vi.fn(), status: "idle" }) }));
vi.mock("@/hooks/use-track-shipment", () => ({ default: () => ({ mutate: vi.fn(), status: "idle" }) }));
vi.mock("@/components/order-account-claim-card", () => ({ OrderAccountClaimCard: () => null }));
vi.mock("../../app/(routes)/pedido/[orderId]/components/order-items-card", () => ({ OrderItemsCard: () => null }));
vi.mock("../../app/(routes)/pedido/[orderId]/components/order-shipping-card", () => ({ OrderShippingCard: () => null }));
vi.mock("../../app/(routes)/pedido/[orderId]/components/order-summary-card", () => ({ OrderSummaryCard: () => null }));
vi.mock("../../app/(routes)/pedido/[orderId]/components/order-timeline", () => ({ OrderTimeline: () => null }));
vi.mock("../../app/(routes)/pedido/[orderId]/components/order-help-card", () => ({ OrderHelpCard: () => null }));
const tiktok = vi.hoisted(() => ({ trackTikTokCompletePayment: vi.fn(() => true) }));
vi.mock("@/lib/analytics/tiktok", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics/tiktok")>()),
  trackTikTokCompletePayment: tiktok.trackTikTokCompletePayment,
}));

import SingleOrderPage from "@/app/(routes)/pedido/[orderId]/components/single-order-page";
import { ANALYTICS_CONSENT_CHANGED_EVENT } from "@/lib/analytics-consent";
import { useCheckoutStore } from "@/hooks/use-checkout-store";
import type { Order } from "@/types";

const order = (status: string, method: string): Order =>
  ({
    id: "order-1",
    orderNumber: "ORD-1792999999999-123",
    status,
    total: 15000,
    createdAt: new Date().toISOString(),
    orderItems: [
      { id: "line-1", productId: "prod-1", sku: "LIB-KAW-1", name: "Libreta", price: 12000, quantity: 1, product: { id: "prod-1", sku: "LIB-KAW-1", name: "Libreta", images: [] } },
      { id: "line-2", productId: "prod-2", name: "Sticker", price: "3000", quantity: 1, product: { id: "prod-2", name: "Sticker", images: [] } },
    ],
    shipping: null,
    payment: { id: "pay-1", method },
  }) as unknown as Order;

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} unobserve() {} });
  useCheckoutStore.setState({ pendingOrder: null });
  tiktok.trackTikTokCompletePayment.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TikTok CompletePayment en la página del pedido", () => {
  it("un pedido pagado en línea lo manda con la referencia de los feeds (sku, o el id sin sku)", async () => {
    render(<SingleOrderPage order={order("PAID", "Bold")} />);
    await waitFor(() => expect(tiktok.trackTikTokCompletePayment).toHaveBeenCalled());
    const [sentOrder, items] = tiktok.trackTikTokCompletePayment.mock.calls[0] as unknown as [Order, { item_id: string; price: number }[]];
    expect(sentOrder.orderNumber).toBe("ORD-1792999999999-123");
    expect(items.map((item) => item.item_id)).toEqual(["LIB-KAW-1", "prod-2"]);
    expect(items.map((item) => item.price)).toEqual([12000, 3000]);
  });

  it("si «Publicidad» llega con la página abierta, lo intenta otra vez", async () => {
    render(<SingleOrderPage order={order("PAID", "Wompi")} />);
    await waitFor(() => expect(tiktok.trackTikTokCompletePayment).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new Event(ANALYTICS_CONSENT_CHANGED_EVENT));
    expect(tiktok.trackTikTokCompletePayment).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["PENDING", "BankTransfer"],
    ["PENDING", "COD"],
    ["PAID", "BankTransfer"],
    ["PENDING", "Bold"],
  ])("no lo manda para %s con %s", async (status, method) => {
    render(<SingleOrderPage order={order(status, method)} />);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(tiktok.trackTikTokCompletePayment).not.toHaveBeenCalled();
  });
});
