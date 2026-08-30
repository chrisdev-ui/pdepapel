/* @vitest-environment jsdom */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CartPreviewProvider,
  useCartPreview,
} from "@/providers/cart-preview-provider";
import type { Product } from "@/types";

const analyticsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/customer-analytics", () => ({
  trackCustomerEvent: analyticsMock,
}));

vi.mock("@/components/ui/CldImage", () => ({
  CldImage: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

const product = {
  id: "product-1",
  name: "Mouse pad kawaii",
  price: "25000",
  images: [],
} as unknown as Product;

function Trigger() {
  const { showCartPreview } = useCartPreview();
  return (
    <button
      onClick={() =>
        showCartPreview({ product, quantity: 2, source: "product_detail" })
      }
    >
      Agregar
    </button>
  );
}

describe("CartPreviewProvider", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    analyticsMock.mockReset();
  });

  it("shows useful cart actions without blocking navigation", () => {
    render(
      <CartPreviewProvider>
        <Trigger />
      </CartPreviewProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Mouse pad kawaii se agregó al carrito",
    );
    expect(screen.getByRole("link", { name: "Ver carrito" })).toHaveAttribute(
      "href",
      "/carrito",
    );
    expect(
      screen.getByRole("link", { name: "Finalizar compra" }),
    ).toHaveAttribute("href", "/finalizar-compra");
    expect(analyticsMock).toHaveBeenCalledWith("cart_preview_view", {
      source: "product_detail",
    });
    expect(
      screen.getByRole("complementary", {
        name: "Producto agregado al carrito",
      }),
    ).toHaveClass("z-[60]", "overscroll-contain");
  });

  it("dismisses automatically after eight seconds", () => {
    vi.useFakeTimers();
    render(
      <CartPreviewProvider>
        <Trigger />
      </CartPreviewProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));

    act(() => vi.advanceTimersByTime(8_000));

    expect(screen.queryByLabelText("Producto agregado al carrito")).toBeNull();
  });
});
