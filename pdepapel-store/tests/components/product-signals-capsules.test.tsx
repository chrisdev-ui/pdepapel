// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/providers/storefront-settings-provider", () => ({ useStorefrontSettings: () => ({ freeShippingThreshold: 120000, deliveryEstimate: null }) }));
vi.mock("@/components/free-shipping-progress", () => ({ FreeShippingProgress: () => null }));
vi.mock("@/components/notify-me-form", () => ({ NotifyMeForm: () => null }));

import { ProductSignals } from "@/components/product-signals";
import { useCart } from "@/hooks/use-cart";
import type { ProductAvailability } from "@/lib/product-availability";
import type { Product } from "@/types";

const availability: ProductAvailability = { status: "in-stock", canBuy: true, ctaLabel: "Agregar", stockLabel: "Disponible", tone: "green", presale: null } as ProductAvailability;

const capsule = (name: string) =>
  ({ id: `p-${name}`, name, price: 40000, stock: 10, category: { id: "c", name: "Kits sorpresa", slug: "kits-sorpresa" }, images: [] }) as unknown as Product;

afterEach(() => {
  cleanup();
  useCart.setState({ items: [] });
});

/** El aviso contaba la cantidad del carrito: un combo x5 decía «1 artículo sorpresa» (2026-11-03). */
describe("ProductSignals en un combo de cápsulas", () => {
  it("un combo x5 promete 5 sorpresas", () => {
    render(<ProductSignals product={capsule("Cápsula sorpresa x5")} availability={availability} quantity={1} />);
    expect(screen.getByText(/5 artículos sorpresa/)).toBeTruthy();
  });

  it("dos combos x6 prometen 12", () => {
    render(<ProductSignals product={capsule("Cápsula sorpresa x6")} availability={availability} quantity={2} />);
    expect(screen.getByText(/12 artículos sorpresa/)).toBeTruthy();
  });

  it("enlaza las condiciones de las cápsulas en los términos", () => {
    render(<ProductSignals product={capsule("Cápsula sorpresa Cyber x5")} availability={availability} quantity={1} />);
    expect(screen.getByText(/5 artículos sorpresa/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver condiciones" }).getAttribute("href")).toBe("/politicas/terminos#productos-precios");
  });

  it("una cajita sorpresa sin «xN» sigue contando la cantidad", () => {
    render(<ProductSignals product={capsule("Cajita sorpresa Snoopy")} availability={availability} quantity={3} />);
    expect(screen.getByText(/3 artículos sorpresa/)).toBeTruthy();
  });
});
