// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountHub } from "@/components/account/account-hub";
import type { Order } from "@/types";

const mocks = vi.hoisted(() => ({
  auth: { userId: "user_1" as string | null, isLoaded: true, getToken: vi.fn() },
  user: {
    isLoaded: true,
    user: {
      firstName: "Paula",
      imageUrl: "",
      createdAt: new Date("2026-03-02T10:00:00.000Z"),
      primaryEmailAddress: { emailAddress: "paula@ejemplo.com" },
    } as Record<string, unknown> | null,
  },
  clerk: { openUserProfile: vi.fn(), signOut: vi.fn() },
  getOrders: vi.fn(),
  getCustomerAddresses: vi.fn(),
  deleteCustomerAddress: vi.fn(),
  getSavedSearches: vi.fn(),
  getWelcomeBenefit: vi.fn(),
  wishlist: [] as Array<Record<string, unknown>>,
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => mocks.auth,
  useUser: () => mocks.user,
  useClerk: () => mocks.clerk,
}));
vi.mock("@/actions/get-orders", () => ({ getOrders: mocks.getOrders }));
vi.mock("@/actions/customer-addresses", () => ({
  getCustomerAddresses: mocks.getCustomerAddresses,
  deleteCustomerAddress: mocks.deleteCustomerAddress,
}));
vi.mock("@/actions/account-saved-searches", () => ({ getSavedSearches: mocks.getSavedSearches }));
vi.mock("@/actions/get-welcome-benefit", () => ({ getWelcomeBenefit: mocks.getWelcomeBenefit }));
vi.mock("@/hooks/use-wishlist", () => ({
  useWishlist: (selector: (state: { items: unknown[] }) => unknown) => selector({ items: mocks.wishlist }),
}));

const unpaid = {
  id: "o2",
  orderNumber: "PDP-0002",
  status: "CREATED",
  total: 17280,
  createdAt: "2026-09-01T12:00:00.000Z",
  orderItems: [{ id: "i", quantity: 1 }],
  payment: { id: "p", method: "Bold" },
  shipping: { id: "s", provider: "ENVIOCLICK", status: "Preparing", cost: 7280 },
} as unknown as Order;

const delivered = {
  id: "o1",
  orderNumber: "PDP-0001",
  status: "PAID",
  total: 25000,
  createdAt: "2026-08-01T12:00:00.000Z",
  orderItems: [{ id: "i", quantity: 1 }],
  payment: { id: "p", method: "Bold" },
  shipping: { id: "s", provider: "ENVIOCLICK", status: "Delivered", cost: 5000 },
} as unknown as Order;

function renderHub() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountHub />
    </QueryClientProvider>,
  );
}

describe("AccountHub", () => {
  beforeEach(() => {
    mocks.auth.userId = "user_1";
    mocks.auth.getToken.mockResolvedValue("token");
    mocks.getOrders.mockResolvedValue([delivered, unpaid]);
    mocks.getCustomerAddresses.mockResolvedValue([
      { id: "a1", label: "Casa", fullName: "Paula", phone: "", address: "Calle 12 #3-4", city: "Medellín", department: "Antioquia", isDefault: true },
      { id: "a2", label: "", fullName: "Paula", phone: "", address: "Cra 5 #6-7", city: "Envigado", department: "Antioquia", isDefault: false },
    ]);
    mocks.getSavedSearches.mockResolvedValue([{ id: "s1", name: "Stickers rosados", query: "q=1", createdAt: "2026-09-01" }]);
    mocks.getWelcomeBenefit.mockResolvedValue({ code: "BIENVENIDA10", type: "PERCENTAGE", amount: 10, minOrderValue: 30000, endDate: "2026-12-31T00:00:00.000Z" });
    mocks.wishlist = [{ id: "w1", price: "1000", originalPrice: 2000 }, { id: "w2", price: "500" }];
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("greets the customer and summarises every account area from existing data", async () => {
    renderHub();

    expect(await screen.findByRole("heading", { level: 1, name: "Hola, Paula" })).toBeInTheDocument();
    expect(screen.getByText(/paula@ejemplo.com · cliente desde 2 de marzo de 2026/)).toBeInTheDocument();

    const orders = screen.getByRole("region", { name: "Mis pedidos" });
    expect(within(orders).getByText(/2 pedidos · el último el 1 de septiembre de 2026/)).toBeInTheDocument();
    expect(within(orders).getByRole("link", { name: /PDP-0002/ })).toHaveAttribute("href", "/pedido/o2");

    const addresses = screen.getByRole("region", { name: "Direcciones guardadas" });
    expect(await within(addresses).findByText("Casa")).toBeInTheDocument();
    expect(within(addresses).getByText("Principal")).toBeInTheDocument();

    expect(within(screen.getByRole("region", { name: "Favoritos" })).getByText(/2 productos · 1 bajó de precio/)).toBeInTheDocument();
    expect(await screen.findByText("Stickers rosados")).toBeInTheDocument();
    expect(await screen.findByText(/10 % de descuento/)).toBeInTheDocument();
    expect(screen.getByText("BIENVENIDA10")).toBeInTheDocument();
  });

  it("surfaces an unpaid order with a direct payment link", async () => {
    renderHub();

    const banner = await screen.findByRole("status", { name: "Pedido por pagar" });
    expect(within(banner).getByText(/Tienes un pedido por pagar/)).toBeInTheDocument();
    expect(within(banner).getByRole("link", { name: "Pagar ahora" })).toHaveAttribute("href", "/pedido/o2?autoPay=true");
  });

  it("deletes a saved address through the existing endpoint", async () => {
    const user = userEvent.setup();
    mocks.deleteCustomerAddress.mockResolvedValue(undefined);
    renderHub();

    await user.click(await screen.findByRole("button", { name: "Eliminar la dirección Cra 5 #6-7" }));

    await waitFor(() => expect(mocks.deleteCustomerAddress).toHaveBeenCalledWith("a2", "token"));
    await waitFor(() => expect(screen.queryByText(/Cra 5 #6-7/)).not.toBeInTheDocument());
    expect(screen.getByText("Casa")).toBeInTheDocument();
  });

  it("opens the Clerk profile for name and email edits and signs out to home", async () => {
    const user = userEvent.setup();
    renderHub();

    await user.click(await screen.findByRole("button", { name: "Editar mis datos" }));
    expect(mocks.clerk.openUserProfile).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(mocks.clerk.signOut).toHaveBeenCalledWith({ redirectUrl: "/" });
  });

  it("shows the skeleton while the session is loading", () => {
    mocks.auth.isLoaded = false;
    renderHub();
    expect(screen.getByRole("status", { name: "Cargando tu cuenta" })).toBeInTheDocument();
    mocks.auth.isLoaded = true;
  });
});
