/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/producto/cuaderno-snoopy" }));
vi.mock("@/lib/customer-analytics", () => ({ trackCustomerEvent: vi.fn(), toAnalyticsItem: () => ({}), getAnalyticsValue: () => 0 }));
vi.mock("@/providers/cart-preview-provider", () => ({ useCartPreview: () => ({ markCartTouched: vi.fn(), showCartPreview: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/catalog-client", () => ({ fetchProductFromClient: vi.fn() }));
vi.mock("@/components/gallery", () => ({ Gallery: () => null }));
vi.mock("@/components/kit-contents", () => ({ KitContents: () => null }));
vi.mock("@/components/reviews/reviews", () => ({ Reviews: () => null }));

import { fetchProductFromClient } from "@/lib/catalog-client";
import { SingleProductPage } from "@/components/single-product-page";
import { useCart } from "@/hooks/use-cart";
import { useWishlist } from "@/hooks/use-wishlist";
import type { Product, ProductVariant } from "@/types";

const product = {
  id: "p1",
  slug: "cuaderno-snoopy",
  name: "Cuaderno Snoopy",
  description: "<p>Un cuaderno.</p>",
  price: "25000",
  stock: 8,
  sku: "CUA-SNO",
  images: [],
  category: { id: "c1", name: "Cuadernos", slug: "cuadernos" },
  design: { id: "d1", name: "Snoopy" },
  color: { id: "col-rosa", name: "Rosa", value: "#f9a8d4" },
  reviews: [],
} as unknown as Product;

const otherColor = {
  ...product,
  id: "p2",
  slug: "cuaderno-snoopy-lila",
  color: { id: "col-lila", name: "Lila", value: "#c4b5fd" },
} as unknown as Product;

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} unobserve() {} });
  useWishlist.setState({ items: [], guestItems: [], accountUserId: null, isHydrated: true });
  useCart.setState({ items: [] });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SingleProductPage", () => {
  it("starts at one unit when the product is not in the cart yet", () => {
    render(<SingleProductPage product={product} />);
    expect(screen.getAllByRole("spinbutton")[0]).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getAllByRole("button", { name: /Agregar al carrito/ })[0]).toHaveTextContent("25.000");
  });

  it("shows the quantity already in the cart and prices the button for it", () => {
    useCart.setState({ items: [{ ...product, quantity: 3 } as unknown as Product] });
    render(<SingleProductPage product={product} />);
    expect(screen.getAllByRole("spinbutton")[0]).toHaveAttribute("aria-valuenow", "3");
    expect(screen.getAllByRole("button", { name: /Agregar al carrito/ })[0]).toHaveTextContent("75.000");
  });

  it("follows the cart when another surface changes the quantity", () => {
    useCart.setState({ items: [{ ...product, quantity: 2 } as unknown as Product] });
    render(<SingleProductPage product={product} />);
    expect(screen.getAllByRole("spinbutton")[0]).toHaveAttribute("aria-valuenow", "2");

    act(() => {
      useCart.setState({ items: [{ ...product, quantity: 5 } as unknown as Product] });
    });
    expect(screen.getAllByRole("spinbutton")[0]).toHaveAttribute("aria-valuenow", "5");
  });

  it("keeps a product that is not in the cart at one unit even if others are", () => {
    useCart.setState({ items: [{ ...product, id: "otro", quantity: 4 } as unknown as Product] });
    render(<SingleProductPage product={product} />);
    expect(screen.getAllByRole("spinbutton")[0]).toHaveAttribute("aria-valuenow", "1");
  });

  it("takes the quantity of the variant the shopper switches to", async () => {
    useCart.setState({
      items: [
        { ...product, quantity: 3 } as unknown as Product,
        { ...otherColor, quantity: 6 } as unknown as Product,
      ],
    });
    vi.mocked(fetchProductFromClient).mockResolvedValue(otherColor);
    render(<SingleProductPage product={product} siblings={[otherColor] as unknown as ProductVariant[]} />);
    expect(screen.getAllByRole("spinbutton")[0]).toHaveAttribute("aria-valuenow", "3");

    fireEvent.click(screen.getByRole("button", { name: "Seleccionar color Lila" }));
    await waitFor(() =>
      expect(screen.getAllByRole("spinbutton")[0]).toHaveAttribute("aria-valuenow", "6"),
    );
  });

  it("moves the title and the canonical onto the variant being shown", async () => {
    document.head.innerHTML = `
      <title>Cuaderno Snoopy - Rosa | P de Papel</title>
      <link rel="canonical" href="https://papeleriapdepapel.com/producto/cuaderno-snoopy" />
      <meta property="og:title" content="Cuaderno Snoopy - Rosa | P de Papel" />
    `;
    vi.mocked(fetchProductFromClient).mockResolvedValue(otherColor);
    render(<SingleProductPage product={product} siblings={[otherColor] as unknown as ProductVariant[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Seleccionar color Lila" }));

    await waitFor(() => expect(document.title).toBe("Cuaderno Snoopy - Lila | P de Papel"));
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://papeleriapdepapel.com/producto/cuaderno-snoopy-lila",
    );
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute("content")).toBe(
      "Cuaderno Snoopy - Lila | P de Papel",
    );
  });

  it("updates the title in the same commit that rewrites the url", async () => {
    const pushState = vi.spyOn(window.history, "pushState");
    document.head.innerHTML = `<title>Cuaderno Snoopy - Rosa | P de Papel</title>`;
    vi.mocked(fetchProductFromClient).mockResolvedValue(otherColor);
    render(<SingleProductPage product={product} siblings={[otherColor] as unknown as ProductVariant[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Seleccionar color Lila" }));

    await waitFor(() => expect(pushState).toHaveBeenCalled());
    // Si el título llegara tarde, el page_view de GA4 saldría con la variante vieja.
    expect(document.title).toBe("Cuaderno Snoopy - Lila | P de Papel");
    pushState.mockRestore();
  });

  it("puts the title back when the shopper goes back to the previous variant", async () => {
    document.head.innerHTML = `<title>Cuaderno Snoopy - Rosa | P de Papel</title>`;
    vi.mocked(fetchProductFromClient).mockResolvedValue(otherColor);
    render(<SingleProductPage product={product} siblings={[otherColor] as unknown as ProductVariant[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Seleccionar color Lila" }));
    await waitFor(() => expect(document.title).toBe("Cuaderno Snoopy - Lila | P de Papel"));

    vi.mocked(fetchProductFromClient).mockResolvedValue(product);
    window.history.pushState(null, "", "/producto/cuaderno-snoopy");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await waitFor(() => expect(document.title).toBe("Cuaderno Snoopy - Rosa | P de Papel"));
  });

  it("drops back to one unit when the new variant is not in the cart", async () => {
    useCart.setState({ items: [{ ...product, quantity: 3 } as unknown as Product] });
    vi.mocked(fetchProductFromClient).mockResolvedValue(otherColor);
    render(<SingleProductPage product={product} siblings={[otherColor] as unknown as ProductVariant[]} />);
    expect(screen.getAllByRole("spinbutton")[0]).toHaveAttribute("aria-valuenow", "3");

    fireEvent.click(screen.getByRole("button", { name: "Seleccionar color Lila" }));
    await waitFor(() =>
      expect(screen.getAllByRole("spinbutton")[0]).toHaveAttribute("aria-valuenow", "1"),
    );
  });
  /**
   * La ficha leía la cookie con `cookies()` y eso la sacaba de la caché. Ahora
   * el HTML del servidor siempre trae el estado público y el navegador cambia
   * al botón de compra solo si encuentra la cookie.
   */
  describe("early access", () => {
    const comingSoon = { ...product, availableAt: "2099-01-01T00:00:00.000Z" } as unknown as Product;
    const clearCookie = () => {
      document.cookie = "pdp_early_access=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    };
    afterEach(clearCookie);

    it("shows the public coming-soon state without the cookie", () => {
      render(<SingleProductPage product={comingSoon} />);
      expect(screen.queryAllByRole("button", { name: /Agregar al carrito/ })).toHaveLength(0);
      expect(screen.getAllByText(/Avísame cuando llegue/).length).toBeGreaterThan(0);
    });

    it("unlocks the buy button in the browser when the early-access cookie is present", async () => {
      document.cookie = "pdp_early_access=token-firmado; path=/";
      render(<SingleProductPage product={comingSoon} />);
      await waitFor(() => expect(screen.getAllByRole("button", { name: /Agregar al carrito/ }).length).toBeGreaterThan(0));
    });

    it("never puts the early-access state in server-rendered HTML, even with the cookie set", () => {
      document.cookie = "pdp_early_access=token-firmado; path=/";
      const html = renderToString(<SingleProductPage product={comingSoon} />);
      expect(html).toContain("Avísame cuando llegue");
      expect(html).not.toContain("Agregar al carrito");
    });
  });
});
