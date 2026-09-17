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

import SingleOrderPage from "@/app/(routes)/pedido/[orderId]/components/single-order-page";
import { OrderStatus } from "@/constants";
import { useCart } from "@/hooks/use-cart";
import { useCheckoutStore } from "@/hooks/use-checkout-store";
import type { Order, Product } from "@/types";

const cartItem = (id: string, quantity: number) =>
  ({ id, name: `Producto ${id}`, price: "10000", quantity, stock: 10, images: [], reviews: [] }) as unknown as Product;

const paidOrder = (lines: [string, number][]): Order =>
  ({
    id: "order-1",
    orderNumber: "ORD-1",
    status: OrderStatus.PAID,
    total: 10000,
    createdAt: new Date().toISOString(),
    orderItems: lines.map(([id, quantity], index) => ({
      id: `line-${index}`,
      product: { id, name: `Producto ${id}`, images: [] },
      quantity,
      name: `Producto ${id}`,
    })),
    shipping: null,
    payment: null,
  }) as unknown as Order;

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} unobserve() {} });
  useCheckoutStore.setState({ pendingOrder: null });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("vaciar el carrito en la página del pedido", () => {
  it("lo vacía aunque este navegador no recuerde el pedido, si el carrito es justo lo que se pagó", async () => {
    // Escenario Instagram: se pagó en otro navegador, aquí quedó el carrito.
    useCart.setState({ items: [cartItem("p1", 2), cartItem("p2", 1)] });

    render(<SingleOrderPage order={paidOrder([["p1", 2], ["p2", 1]])} />);

    await waitFor(() => expect(useCart.getState().items).toHaveLength(0));
  });

  it("no toca un carrito que no corresponde al pedido pagado", async () => {
    useCart.setState({ items: [cartItem("otro", 1)] });

    render(<SingleOrderPage order={paidOrder([["p1", 2]])} />);

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(useCart.getState().items).toHaveLength(1);
  });

  it("sigue vaciando por el camino de siempre: este navegador recuerda el pedido", async () => {
    useCart.setState({ items: [cartItem("otro", 5)] });
    useCheckoutStore.setState({
      pendingOrder: { id: "order-1", orderNumber: "ORD-1", createdAt: Date.now() } as never,
    });

    render(<SingleOrderPage order={paidOrder([["p1", 2]])} />);

    await waitFor(() => expect(useCart.getState().items).toHaveLength(0));
    expect(useCheckoutStore.getState().pendingOrder).toBeNull();
  });

  it("no vacía nada mientras el pedido no esté pagado", async () => {
    useCart.setState({ items: [cartItem("p1", 2)] });
    const pending = { ...paidOrder([["p1", 2]]), status: OrderStatus.PENDING } as Order;

    render(<SingleOrderPage order={pending} />);

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(useCart.getState().items).toHaveLength(1);
  });
});
