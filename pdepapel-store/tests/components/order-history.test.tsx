// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
vi.mock("@/components/ui/cloudinary-image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  CloudinaryImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const paidOrder = {
  id: "order_1",
  orderNumber: "PDP-0001",
  status: "PAID",
  subtotal: 20000,
  total: 25000,
  createdAt: "2026-08-01T12:00:00.000Z",
  orderItems: [{ id: "i1", quantity: 2, imageUrl: "https://img/1.jpg" }],
  payment: { id: "p1", method: "Bold" },
  shipping: { id: "s1", provider: "ENVIOCLICK", cost: 5000, status: "InTransit", trackingCode: "970", carrierName: "Coordinadora" },
} as unknown as Order;

const unpaidOrder = {
  id: "order_2",
  orderNumber: "PDP-0002",
  status: "CREATED",
  subtotal: 10000,
  total: 17280,
  createdAt: "2026-09-01T12:00:00.000Z",
  orderItems: [{ id: "i2", quantity: 1 }],
  payment: { id: "p2", method: "Bold" },
  shipping: { id: "s2", provider: "ENVIOCLICK", cost: 7280, status: "Preparing" },
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

  it("renders the orders fetched with the session token, newest first", async () => {
    getOrders.mockResolvedValue([paidOrder, unpaidOrder]);
    renderOrderHistory();

    expect(
      screen.getByRole("status", { name: "Cargando tus órdenes" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("#PDP-0001")).toBeInTheDocument();
    expect(getOrders).toHaveBeenCalledWith("session-token");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Mis pedidos" })).toBeInTheDocument();

    const articles = screen.getAllByRole("article");
    expect(within(articles[0]).getByText("#PDP-0002")).toBeInTheDocument();
    expect(within(articles[1]).getByText("#PDP-0001")).toBeInTheDocument();
  });

  it("shows the order total once (shipping is already included) and the shared status vocabulary", async () => {
    getOrders.mockResolvedValue([paidOrder, unpaidOrder]);
    renderOrderHistory();

    const paid = (await screen.findByText("#PDP-0001")).closest("article")!;
    expect(within(paid).getByText("$ 25.000")).toBeInTheDocument();
    expect(within(paid).queryByText("$ 30.000")).not.toBeInTheDocument();
    expect(within(paid).getByText("En camino")).toBeInTheDocument();
    expect(within(paid).getByRole("link", { name: /Rastrear/ })).toHaveAttribute(
      "href",
      "https://www.envioclick.com/co/track/970",
    );

    const unpaid = screen.getByText("#PDP-0002").closest("article")!;
    expect(within(unpaid).getByText("Por pagar")).toBeInTheDocument();
    expect(within(unpaid).getByRole("link", { name: /Pagar ahora/ })).toHaveAttribute(
      "href",
      "/pedido/order_2?autoPay=true",
    );
  });

  it("filters by stage", async () => {
    const user = userEvent.setup();
    getOrders.mockResolvedValue([paidOrder, unpaidOrder]);
    renderOrderHistory();
    await screen.findByText("#PDP-0001");

    await user.click(screen.getByRole("button", { name: /Por pagar/ }));
    expect(screen.queryByText("#PDP-0001")).not.toBeInTheDocument();
    expect(screen.getByText("#PDP-0002")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Todos/ }));
    expect(screen.getByText("#PDP-0001")).toBeInTheDocument();
  });

  it("invites visitors to sign in without requesting orders", () => {
    auth.userId = null;
    renderOrderHistory();

    expect(
      screen.getByRole("heading", { name: "Tus pedidos, siempre a la mano" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute(
      "href",
      "/iniciar-sesion?redirect_url=%2Fmis-pedidos",
    );
    expect(getOrders).not.toHaveBeenCalled();
  });

  it("shows an empty state with a way into the shop", async () => {
    getOrders.mockResolvedValue([]);
    renderOrderHistory();

    expect(
      await screen.findByRole("heading", { name: "Todavía no tienes pedidos" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explorar la tienda" })).toHaveAttribute("href", "/tienda");
  });

  it("retries in place after a failed request", async () => {
    const user = userEvent.setup();
    // The query retries once on its own before surfacing the error state.
    getOrders
      .mockRejectedValueOnce(new Error("boom"))
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([paidOrder]);
    renderOrderHistory();

    await user.click(
      await screen.findByRole(
        "button",
        { name: "Reintentar" },
        { timeout: 5_000 },
      ),
    );

    expect(await screen.findByText("#PDP-0001")).toBeInTheDocument();
    await waitFor(() => expect(getOrders).toHaveBeenCalledTimes(3));
  });
});
