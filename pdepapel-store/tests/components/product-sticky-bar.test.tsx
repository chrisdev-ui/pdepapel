/* @vitest-environment jsdom */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({ default: (props: React.ComponentProps<"img">) => <img {...props} /> }));
vi.mock("@/hooks/use-add-product-to-cart", () => ({ useAddProductToCart: () => vi.fn() }));

import { ProductStickyBar } from "@/components/product-sticky-bar";
import { getProductAvailability } from "@/lib/product-availability";
import type { Product } from "@/types";

let callback: IntersectionObserverCallback | null = null;

class FakeObserver {
  constructor(cb: IntersectionObserverCallback) {
    callback = cb;
  }
  observe() {}
  disconnect() {}
}

const product = { id: "p1", name: "Cuaderno Snoopy", price: "25000", stock: 5, images: [], reviews: [] } as unknown as Product;

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderBar(stock = 5) {
  const target = { current: document.createElement("div") };
  const item = { ...product, stock };
  render(<ProductStickyBar product={item} availability={getProductAvailability(item)} quantity={2} targetRef={target} onNotify={() => {}} />);
}

describe("ProductStickyBar", () => {
  it("stays hidden until the main button scrolls above the viewport, then shows the line total", () => {
    renderBar();
    const bar = screen.getByTestId("product-sticky-bar");
    expect(bar).toHaveAttribute("aria-hidden", "true");

    act(() => callback?.([{ isIntersecting: false, boundingClientRect: { top: -10 } } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(bar).toHaveAttribute("aria-hidden", "false");
    expect(bar).toHaveTextContent("$ 50.000");
    expect(screen.getByRole("button", { name: /Agregar al carrito/ })).toBeInTheDocument();

    act(() => callback?.([{ isIntersecting: false, boundingClientRect: { top: 400 } } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(bar).toHaveAttribute("aria-hidden", "true");
  });

  it("offers the notify action instead of add-to-cart when the product is sold out", () => {
    renderBar(0);
    expect(screen.getByRole("button", { name: "Avísame", hidden: true })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /al carrito/, hidden: true })).toBeNull();
  });
});
