/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/customer-analytics", () => ({ trackCustomerEvent: vi.fn(), toAnalyticsItem: () => ({}), getAnalyticsValue: () => 0 }));
vi.mock("@/providers/cart-preview-provider", () => ({ useCartPreview: () => ({ markCartTouched: vi.fn(), showCartPreview: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));

import { ProductInfo } from "@/components/product-info";
import { useWishlist } from "@/hooks/use-wishlist";
import type { Product, ProductVariant } from "@/types";

const product = {
  id: "p1",
  slug: "cuaderno-snoopy",
  name: "Cuaderno Snoopy",
  description: "<p>Un cuaderno.</p>",
  price: "25000",
  stock: 4,
  sku: "CUA-SNO",
  images: [],
  category: { id: "c1", name: "Cuadernos", slug: "cuadernos" },
  reviews: [
    { id: "r1", userId: "u1", name: "Laura", rating: 5, comment: "Hermoso" },
    { id: "r2", userId: "u2", name: "Ana", rating: 4, comment: "Bien" },
  ],
} as unknown as Product;

beforeEach(() => {
  useWishlist.setState({ items: [], guestItems: [], accountUserId: null, isHydrated: true });
});
afterEach(cleanup);

describe("ProductInfo", () => {
  it("shows the real average rating next to the title with a link to the reviews", () => {
    render(<ProductInfo data={product} />);
    expect(screen.getByRole("heading", { level: 1, name: "Cuaderno Snoopy" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Calificación 4.5 de 5" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "2 reseñas" })).toHaveAttribute("href", "#resenas");
    expect(screen.getByText("Ref. CUA-SNO")).toBeInTheDocument();
  });

  it("toggles the favorite from the product page in both directions", () => {
    render(<ProductInfo data={product} />);
    const heart = screen.getByRole("button", { name: "Agregar a favoritos" });
    expect(heart).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(heart);
    expect(useWishlist.getState().items.map((item) => item.id)).toEqual(["p1"]);
    fireEvent.click(screen.getByRole("button", { name: "Quitar de favoritos" }));
    expect(useWishlist.getState().items).toHaveLength(0);
  });

  it("puts the line total in the main button and the stock in the signals block", () => {
    render(<ProductInfo data={product} quantity={2} />);
    expect(screen.getByRole("button", { name: /Agregar al carrito/ })).toHaveTextContent("50.000");
    expect(screen.getByRole("status")).toHaveTextContent("En stock · quedan 4 unidades");
  });

  it("swaps the button for a notify action when the product is sold out", () => {
    render(<ProductInfo data={{ ...product, stock: 0 }} />);
    expect(screen.getByRole("button", { name: "Avísame cuando vuelva" })).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });
});

describe("ProductInfo colour swatches (#3)", () => {
  const design = { id: "d1", name: "Halloween" };
  const size = { id: "s1", name: "Único", value: "U" };
  const blanco = { id: "k-bl", name: "Blanco", value: "#ffffff", swatchType: "SOLID" as const };
  const multicolor = { id: "k-mu", name: "Multicolor", value: "#ffffff", swatchType: "MULTICOLOR" as const };
  const negro = { id: "k-ne", name: "Negro", value: "#000000" };
  const variant = (id: string, color: ProductVariant["color"], stock: number): ProductVariant => ({ id, slug: `lapicero-${id}`, design, size, color, stock, image: null });
  const current = { ...product, id: "v-bl", slug: "lapicero-v-bl", design, size, color: blanco } as unknown as Product;
  const siblings = [variant("v-bl", blanco, 3), variant("v-mu", multicolor, 2), variant("v-ne", negro, 0)];

  it("keeps the accessible names and marks the current colour", () => {
    render(<ProductInfo data={current} siblings={siblings} />);
    expect(screen.getByRole("link", { name: "Seleccionar color Blanco" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Seleccionar color Multicolor" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Seleccionar color Negro (agotado)" })).toBeInTheDocument();
  });

  it("paints Multicolor and Blanco differently from the explicit swatchType, and a missing type as solid", () => {
    render(<ProductInfo data={current} siblings={siblings} />);
    const typeOf = (name: string) => screen.getByRole("link", { name }).querySelector("[data-swatch-type]")?.getAttribute("data-swatch-type");
    expect(typeOf("Seleccionar color Blanco")).toBe("SOLID");
    expect(typeOf("Seleccionar color Multicolor")).toBe("MULTICOLOR");
    expect(typeOf("Seleccionar color Negro (agotado)")).toBe("SOLID");
    expect(screen.getByRole("link", { name: "Seleccionar color Negro (agotado)" }).querySelector("[data-swatch-slash]")).not.toBeNull();
    // El `title` ya no hace falta: el nombre sale en el encabezado.
    expect(screen.getByRole("link", { name: "Seleccionar color Multicolor" })).not.toHaveAttribute("title");
  });

  it("shows the hovered or focused colour name in the header and goes back to the chosen one", () => {
    render(<ProductInfo data={current} siblings={siblings} />);
    const heading = screen.getByTestId("color-heading-name");
    expect(heading).toHaveTextContent("Blanco");
    const multicolorLink = screen.getByRole("link", { name: "Seleccionar color Multicolor" });
    fireEvent.mouseEnter(multicolorLink);
    expect(heading).toHaveTextContent("Multicolor");
    fireEvent.mouseLeave(multicolorLink.parentElement!);
    expect(heading).toHaveTextContent("Blanco");
    const negroLink = screen.getByRole("link", { name: "Seleccionar color Negro (agotado)" });
    fireEvent.focus(negroLink);
    expect(heading).toHaveTextContent("Negro");
    fireEvent.blur(negroLink);
    expect(heading).toHaveTextContent("Blanco");
  });

  it("uses the swatch for the single colour dot of a product without variants", () => {
    const { container } = render(<ProductInfo data={{ ...product, color: multicolor } as unknown as Product} />);
    expect(screen.getByText("Multicolor")).toBeInTheDocument();
    expect(container.querySelector("[data-swatch-type]")).toHaveAttribute("data-swatch-type", "MULTICOLOR");
  });
});
