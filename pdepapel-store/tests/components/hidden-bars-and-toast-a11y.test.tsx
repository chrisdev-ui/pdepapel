/* @vitest-environment jsdom */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ scroll: 0 }));

vi.mock("@/components/ui/cloudinary-image", () => ({ CloudinaryImage: (props: React.ComponentProps<"img">) => <img {...props} /> }));
vi.mock("@/hooks/use-add-product-to-cart", () => ({ useAddProductToCart: () => vi.fn() }));
vi.mock("@/hooks/use-scroll-position", () => ({ useScrollPosition: () => state.scroll }));
vi.mock("@/hooks/use-storefront-pathname", () => ({ useStorefrontPathname: () => "/tienda" }));
vi.mock("@/hooks/use-cart-sheet", () => ({ useCartSheet: (select: (value: { open: () => void }) => unknown) => select({ open: () => {} }) }));
vi.mock("@/hooks/use-cart", () => ({
  useCart: (select: (value: { items: unknown[] }) => unknown) =>
    select({ items: [{ id: "p1", name: "Cuaderno", price: "25000", quantity: 1, stock: 5 }] }),
}));

import { MobileCartBar } from "@/components/mobile-cart-bar";
import { ProductStickyBar } from "@/components/product-sticky-bar";
import { Toast, ToastClose, ToastProvider, ToastViewport } from "@/components/ui/toast";
import { getProductAvailability } from "@/lib/product-availability";
import type { Product } from "@/types";

let observe: IntersectionObserverCallback | null = null;

class FakeObserver {
  constructor(callback: IntersectionObserverCallback) {
    observe = callback;
  }
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  state.scroll = 0;
});

/**
 * axe `aria-hidden-focus` en las 40 fichas del rastreo: las barras ocultas
 * llevaban `aria-hidden` pero sus botones seguían en el orden de foco.
 * jsdom no implementa `inert`, así que se comprueba el atributo.
 */
describe("barras fijas ocultas", () => {
  it("la barra de compra de la ficha es inert mientras está oculta, y deja de serlo al aparecer", () => {
    const product = { id: "p1", name: "Cuaderno", price: "25000", stock: 5, images: [], reviews: [] } as unknown as Product;
    render(
      <ProductStickyBar
        product={product}
        availability={getProductAvailability(product)}
        quantity={1}
        targetRef={{ current: document.createElement("div") }}
        onNotify={() => {}}
      />,
    );
    const bar = screen.getByTestId("product-sticky-bar");
    expect(bar).toHaveAttribute("aria-hidden", "true");
    expect(bar).toHaveAttribute("inert", "");

    act(() => observe?.([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(bar).toHaveAttribute("aria-hidden", "false");
    expect(bar).not.toHaveAttribute("inert");
  });

  it("la barra del carrito en el teléfono es inert mientras está oculta", () => {
    const { container, rerender } = render(<MobileCartBar />);
    const bar = container.firstElementChild as HTMLElement;
    expect(bar).toHaveAttribute("aria-hidden", "true");
    expect(bar).toHaveAttribute("inert", "");

    state.scroll = 200;
    rerender(<MobileCartBar />);
    expect(bar).toHaveAttribute("aria-hidden", "false");
    expect(bar).not.toHaveAttribute("inert");
  });
});

describe("aviso (toast)", () => {
  it("el botón de cerrar tiene nombre accesible y el ícono no se lee", () => {
    render(
      <ToastProvider>
        <Toast open>
          <ToastClose />
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );
    const close = screen.getByRole("button", { name: "Cerrar aviso" });
    expect(close.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
