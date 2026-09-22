/* @vitest-environment jsdom */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/cloudinary-image", () => ({ CloudinaryImage: (props: React.ComponentProps<"img">) => <img {...props} /> }));
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
  const aviso = (isIntersecting: boolean, top: number) =>
    act(() =>
      callback?.(
        [{ isIntersecting, boundingClientRect: { top } } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );

  it("shows whenever the main button is off screen, whichever side it is on", () => {
    renderBar();
    const bar = screen.getByTestId("product-sticky-bar");
    expect(bar).toHaveAttribute("aria-hidden", "true");

    /*
     * El caso que faltaba, y el que rompía la ficha en el teléfono: el botón
     * todavía no se ha alcanzado, queda 400 px por debajo del borde. Antes se
     * exigía además `top < 0` —haberlo pasado de largo— así que aquí la barra
     * se quedaba escondida y no había ningún botón de agregar en pantalla.
     */
    aviso(false, 400);
    expect(bar).toHaveAttribute("aria-hidden", "false");
    expect(bar).toHaveTextContent("$ 50.000");
    expect(screen.getByRole("button", { name: /Agregar al carrito/ })).toBeInTheDocument();

    // Con el botón de verdad a la vista, la barra se quita de en medio.
    aviso(true, 120);
    expect(bar).toHaveAttribute("aria-hidden", "true");

    // Y lo que ya funcionaba —pasarlo de largo hacia arriba— sigue igual.
    aviso(false, -10);
    expect(bar).toHaveAttribute("aria-hidden", "false");
  });

  it("offers the notify action instead of add-to-cart when the product is sold out", () => {
    renderBar(0);
    expect(screen.getByRole("button", { name: "Avísame", hidden: true })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /al carrito/, hidden: true })).toBeNull();
  });
});
