// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OrderHistory } from "@/components/order-history";
import type { Order } from "@/types";

const { auth, getOrders } = vi.hoisted(() => ({
  auth: {
    userId: "user_1" as string | null,
    isLoaded: true,
    getToken: vi.fn(),
  },
  getOrders: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({ useAuth: () => auth }));
vi.mock("@/actions/get-orders", () => ({ getOrders }));

const order = {
  id: "order_1",
  orderNumber: "PDP-0001",
  status: "PAID",
  total: 25000,
  createdAt: "2026-08-01T12:00:00.000Z",
  orderItems: [],
  shipping: { cost: 5000, status: "Preparing" },
} as unknown as Order;

function renderOrderHistory() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <OrderHistory />
    </QueryClientProvider>,
  );
}

describe("OrderHistory", () => {
  beforeEach(() => {
    auth.userId = "user_1";
    auth.isLoaded = true;
    auth.getToken.mockResolvedValue("session-token");
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the order skeleton while the session and the orders load", () => {
    auth.isLoaded = false;
    renderOrderHistory();

    expect(
      screen.getByRole("status", { name: "Cargando tus órdenes" }),
    ).toBeInTheDocument();
    expect(getOrders).not.toHaveBeenCalled();
  });

  it("renders the orders fetched with the session token", async () => {
    getOrders.mockResolvedValue([order]);
    renderOrderHistory();

    expect(
      screen.getByRole("status", { name: "Cargando tus órdenes" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("PDP-0001")).toBeInTheDocument();
    expect(getOrders).toHaveBeenCalledWith("session-token");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("invites visitors to sign in without requesting orders", () => {
    auth.userId = null;
    renderOrderHistory();

    expect(
      screen.getByRole("heading", { name: "Tus pedidos, siempre a la mano" }),
    ).toBeInTheDocument();
    expect(getOrders).not.toHaveBeenCalled();
  });

  it("retries in place after a failed request", async () => {
    const user = userEvent.setup();
    // The query retries once on its own before surfacing the error state.
    getOrders
      .mockRejectedValueOnce(new Error("boom"))
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([order]);
    renderOrderHistory();

    await user.click(
      await screen.findByRole(
        "button",
        { name: "Reintentar" },
        { timeout: 5_000 },
      ),
    );

    expect(await screen.findByText("PDP-0001")).toBeInTheDocument();
    await waitFor(() => expect(getOrders).toHaveBeenCalledTimes(3));
  });
});
