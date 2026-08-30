/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Sheet } from "@/components/ui/sheet";
import type { Product } from "@/types";

const { onClose, push, removeAll, removeItem } = vi.hoisted(() => ({
  onClose: vi.fn(),
  push: vi.fn(),
  removeAll: vi.fn(),
  removeItem: vi.fn(),
}));

const cartItem = {
  id: "product-1",
  slug: "mouse-pad-kawaii",
  name: "Mouse pad kawaii",
  price: "25000",
  quantity: 1,
  images: [],
} as unknown as Product & { quantity: number };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/hooks/use-cart", () => ({
  useCart: () => ({
    items: [cartItem],
    removeAll,
    removeItem,
  }),
}));

vi.mock("@/components/account-prompt", () => ({
  AccountPrompt: () => (
    <aside aria-label="Opciones para crear cuenta o iniciar sesión">
      Acceso opcional
    </aside>
  ),
}));

vi.mock("@/components/ui/CldImage", () => ({
  CldImage: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock("@/lib/customer-analytics", () => ({
  toAnalyticsItem: vi.fn(() => ({})),
  trackCustomerEvent: vi.fn(),
}));

import { NavbarCartContent } from "@/components/navbar-cart-content";

describe("NavbarCartContent", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("keeps account access and cart actions in a vertical responsive footer", () => {
    render(
      <Sheet open>
        <NavbarCartContent onClose={onClose} />
      </Sheet>,
    );

    const footer = screen.getByText("Subtotal").closest("footer");
    expect(footer).toHaveClass("flex-col", "overscroll-contain");
    expect(
      screen.getByRole("complementary", {
        name: "Opciones para crear cuenta o iniciar sesión",
      }),
    ).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Ver carrito" })).toHaveClass(
      "font-quicksand",
      "font-semibold",
      "normal-case",
    );
    expect(
      screen.getByRole("button", { name: "Finalizar compra" }),
    ).toHaveClass("font-quicksand", "font-semibold", "normal-case");
  });

  it("preserves navigation and remove actions", async () => {
    const user = userEvent.setup();

    render(
      <Sheet open>
        <NavbarCartContent onClose={onClose} />
      </Sheet>,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Eliminar Mouse pad kawaii del carrito",
      }),
    );
    expect(removeItem).toHaveBeenCalledWith("product-1");

    await user.click(screen.getByRole("button", { name: "Ver carrito" }));
    expect(onClose).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/carrito");
  });
});
