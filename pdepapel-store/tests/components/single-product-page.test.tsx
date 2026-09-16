/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/producto/cuaderno-snoopy" }));
vi.mock("@/lib/customer-analytics", () => ({ trackCustomerEvent: vi.fn(), toAnalyticsItem: () => ({}), getAnalyticsValue: () => 0 }));
vi.mock("@/providers/cart-preview-provider", () => ({ useCartPreview: () => ({ markCartTouched: vi.fn(), showCartPreview: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/actions/get-product", () => ({ getProduct: vi.fn() }));
vi.mock("@/components/gallery", () => ({ Gallery: () => null }));
vi.mock("@/components/kit-contents", () => ({ KitContents: () => null }));
vi.mock("@/components/reviews/reviews", () => ({ Reviews: () => null }));

import { getProduct } from "@/actions/get-product";
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
    vi.mocked(getProduct).mockResolvedValue(otherColor);
    render(<SingleProductPage product={product} siblings={[otherColor] as unknown as ProductVariant[]} />);
    expect(screen.getAllByRole("spinbutton")[0]).toHaveAttribute("aria-valuenow", "3");

    fireEvent.click(screen.getByRole("button", { name: "Seleccionar color Lila" }));
    await waitFor(() =>
      expect(screen.getAllByRole("spinbutton")[0]).toHaveAttribute("aria-valuenow", "6"),
    );
  });

  it("drops back to one unit when the new variant is not in the cart", async () => {
    useCart.setState({ items: [{ ...product, quantity: 3 } as unknown as Product] });
    vi.mocked(getProduct).mockResolvedValue(otherColor);
    render(<SingleProductPage product={product} siblings={[otherColor] as unknown as ProductVariant[]} />);
    expect(screen.getAllByRole("spinbutton")[0]).toHaveAttribute("aria-valuenow", "3");

    fireEvent.click(screen.getByRole("button", { name: "Seleccionar color Lila" }));
    await waitFor(() =>
      expect(screen.getAllByRole("spinbutton")[0]).toHaveAttribute("aria-valuenow", "1"),
    );
  });
});
