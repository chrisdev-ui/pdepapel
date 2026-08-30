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

const originalMatchMedia = window.matchMedia;

function useMobileViewport() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: query === "(max-width: 639px)",
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
    })),
    writable: true,
  });
}

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
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: originalMatchMedia,
      writable: true,
    });
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
      presentation: "full",
      source: "product_detail",
    });
    const preview = screen.getByRole("complementary", {
      name: "Producto agregado al carrito",
    });
    expect(preview).toHaveClass(
      "bottom-[calc(env(safe-area-inset-bottom)+6.5rem)]",
      "z-[60]",
      "overscroll-contain",
    );
    expect(preview).toHaveAttribute("data-presentation", "full");
    expect(
      screen.getByRole("button", { name: "Cerrar resumen del carrito" }),
    ).toHaveClass("h-11", "min-h-11", "w-11", "min-w-11", "touch-manipulation");
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
    expect(analyticsMock).toHaveBeenCalledWith("cart_preview_dismiss", {
      presentation: "full",
      reason: "auto",
      source: "product_detail",
    });
  });

  it("uses one compact preview for repeated mobile additions", () => {
    vi.useFakeTimers();
    useMobileViewport();
    render(
      <CartPreviewProvider>
        <Trigger />
      </CartPreviewProvider>,
    );

    const trigger = screen.getByRole("button", { name: "Agregar" });
    fireEvent.click(trigger);
    fireEvent.click(trigger);

    const previews = screen.getAllByRole("complementary", {
      name: "Producto agregado al carrito",
    });
    expect(previews).toHaveLength(1);
    expect(previews[0]).toHaveAttribute("data-presentation", "compact");
    expect(screen.queryByRole("link", { name: "Finalizar compra" })).toBeNull();
    expect(screen.getByRole("link", { name: /Ver carrito/ })).toHaveAttribute(
      "href",
      "/carrito",
    );
    expect(analyticsMock).toHaveBeenLastCalledWith("cart_preview_view", {
      presentation: "compact",
      source: "product_detail",
    });
  });

  it("returns to the full mobile preview after the rapid-add window", () => {
    vi.useFakeTimers();
    useMobileViewport();
    render(
      <CartPreviewProvider>
        <Trigger />
      </CartPreviewProvider>,
    );

    const trigger = screen.getByRole("button", { name: "Agregar" });
    fireEvent.click(trigger);
    act(() => vi.advanceTimersByTime(20_001));
    fireEvent.click(trigger);

    expect(
      screen.getByRole("complementary", {
        name: "Producto agregado al carrito",
      }),
    ).toHaveAttribute("data-presentation", "full");
    expect(
      screen.getByRole("link", { name: "Finalizar compra" }),
    ).toBeInTheDocument();
  });

  it("records manual dismissal without exposing product data", () => {
    render(
      <CartPreviewProvider>
        <Trigger />
      </CartPreviewProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));

    fireEvent.click(
      screen.getByRole("button", { name: "Cerrar resumen del carrito" }),
    );

    expect(screen.queryByLabelText("Producto agregado al carrito")).toBeNull();
    expect(analyticsMock).toHaveBeenCalledWith("cart_preview_dismiss", {
      presentation: "full",
      reason: "manual",
      source: "product_detail",
    });
  });
});
