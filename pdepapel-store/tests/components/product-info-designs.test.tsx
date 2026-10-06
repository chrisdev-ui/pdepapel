/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/customer-analytics", () => ({ trackCustomerEvent: vi.fn(), toAnalyticsItem: () => ({}), getAnalyticsValue: () => 0 }));
vi.mock("@/providers/cart-preview-provider", () => ({ useCartPreview: () => ({ markCartTouched: vi.fn(), showCartPreview: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));

import { ProductInfo } from "@/components/product-info";
import { CloudinaryImage } from "@/components/ui/cloudinary-image";
import { useWishlist } from "@/hooks/use-wishlist";
import type { Product, ProductVariant } from "@/types";

/**
 * Selector de diseño con miniatura (issue #3). La miniatura es la foto
 * principal de la variante a la que lleva el clic, servida con la misma
 * copia `w_128` que ya pide la barra fija: ninguna transformación nueva en
 * Cloudinary.
 */
const photo = (name: string) => `https://res.cloudinary.com/demo/image/upload/v1789677472/${name}.jpg`;
const THUMB = "/image/upload/f_auto,q_auto,c_limit,w_128/";

const transparente = { id: "c-tr", name: "Transparente", value: "#ffffff" };
const negro = { id: "c-ne", name: "Negro", value: "#000000" };
const oficio = { id: "s-of", name: "Oficio", value: "OFICIO" };
const design = (id: string, name: string) => ({ id, name });
const gryffindor = design("d-gr", "Gryffindor");
const hufflepuff = design("d-hu", "Hufflepuff");
const ravenclaw = design("d-ra", "Ravenclaw");
const slytherin = design("d-sl", "Slytherin");

const variant = (id: string, d: { id: string; name: string }, color: typeof transparente, stock: number, image: string | null): ProductVariant => ({
  id,
  slug: `carpeta-${id}`,
  size: oficio,
  color,
  design: d,
  stock,
  image,
});

const current = {
  id: "v-sl",
  slug: "carpeta-v-sl",
  name: "Carpeta Harry Potter Slytherin",
  description: "<p>Carpeta.</p>",
  price: "18000",
  stock: 3,
  isGroup: false,
  images: [{ id: "i1", url: photo("slytherin"), isMain: true }],
  category: { id: "c1", name: "Carpetas", slug: "carpetas" },
  design: slytherin,
  color: transparente,
  size: oficio,
  reviews: [],
} as unknown as Product;

const siblings: ProductVariant[] = [
  // Gryffindor existe en negro y en transparente: la miniatura es la del
  // mismo color que la variante actual (la que carga el clic).
  variant("v-gr-ne", gryffindor, negro, 4, photo("gryffindor-negro")),
  variant("v-gr", gryffindor, transparente, 2, photo("gryffindor")),
  variant("v-hu", hufflepuff, transparente, 0, photo("hufflepuff")),
  variant("v-ra", ravenclaw, transparente, 5, photo("ravenclaw")),
  variant("v-sl", slytherin, transparente, 3, photo("slytherin")),
];

beforeEach(() => {
  useWishlist.setState({ items: [], guestItems: [], accountUserId: null, isHydrated: true });
});
afterEach(cleanup);

const imageIn = (link: HTMLElement) => link.querySelector("img");

describe("ProductInfo design options with thumbnails", () => {
  it("shows the photo of the variant each design leads to, named by the design", () => {
    render(<ProductInfo data={current} siblings={siblings} />);

    const link = screen.getByRole("link", { name: "Gryffindor" });
    expect(link).toHaveAttribute("href", "/producto/carpeta-v-gr");
    const img = imageIn(link)!;
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe(`https://res.cloudinary.com/demo${THUMB}v1789677472/gryffindor.jpg`);
    // Decorativa: el nombre accesible del enlace sigue siendo el del diseño.
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("width", "40");
    expect(img).toHaveAttribute("height", "40");
    expect(img).toHaveAttribute("loading", "lazy");
  });

  it("requests exactly the w_128 copy the sticky bar already asks for (no new transformation)", () => {
    render(<ProductInfo data={current} siblings={siblings} />);
    const thumbnails = screen.getAllByRole("link").filter((link) => link.hasAttribute("data-design-thumbnail"));
    expect(thumbnails).toHaveLength(4);

    for (const link of thumbnails) {
      const img = imageIn(link)!;
      const candidates = (img.getAttribute("srcset") ?? "").match(/https:\/\/\S+/g) ?? [];
      expect(img.getAttribute("src")).toContain(THUMB);
      expect(candidates.length).toBeGreaterThan(0);
      for (const url of candidates) expect(url).toContain(THUMB);
    }

    // La barra fija pinta la foto principal a 48×48 (product-sticky-bar.tsx):
    // la miniatura de 40×40 tiene que producir la misma URL, byte a byte.
    const slytherinThumb = imageIn(screen.getByRole("link", { name: "Slytherin" }))!;
    const { getByAltText } = render(<CloudinaryImage src={photo("slytherin")} alt="barra" width={48} height={48} />);
    expect(slytherinThumb.getAttribute("src")).toBe(getByAltText("barra").getAttribute("src"));
    expect(slytherinThumb.getAttribute("srcset")).toBe(getByAltText("barra").getAttribute("srcset"));
  });

  it("announces the selected and the sold-out designs as before", () => {
    render(<ProductInfo data={current} siblings={siblings} />);
    expect(screen.getByRole("link", { name: "Slytherin" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Gryffindor" })).not.toHaveAttribute("aria-current");
    const soldOut = screen.getByRole("link", { name: "Hufflepuff (agotado)" });
    expect(within(soldOut).getByText("Hufflepuff")).toHaveClass("line-through");
    expect(imageIn(soldOut)).toHaveClass("grayscale");
  });

  it("falls back to the text chip when two designs share a photo or the variant has none", () => {
    const shared = photo("compartida");
    render(
      <ProductInfo
        data={current}
        siblings={[
          variant("v-gr", gryffindor, transparente, 2, shared),
          variant("v-hu", hufflepuff, transparente, 2, shared),
          variant("v-ra", ravenclaw, transparente, 2, null),
          variant("v-sl", slytherin, transparente, 3, photo("slytherin")),
        ]}
      />,
    );
    for (const name of ["Gryffindor", "Hufflepuff", "Ravenclaw"]) {
      const link = screen.getByRole("link", { name });
      expect(imageIn(link)).toBeNull();
      expect(link).not.toHaveAttribute("data-design-thumbnail");
      expect(link).toHaveClass("rounded-full");
    }
    expect(imageIn(screen.getByRole("link", { name: "Slytherin" }))).not.toBeNull();
  });

  it("reads the photo from full products too (quick view passes whole products)", () => {
    const full = (id: string, d: typeof gryffindor, url: string) =>
      ({ ...current, id, slug: `carpeta-${id}`, design: d, images: [{ id: `${id}-2`, url: photo("otra"), isMain: false }, { id: `${id}-1`, url, isMain: true }] }) as Product;
    render(
      <ProductInfo
        data={current}
        siblings={[full("v-gr", gryffindor, photo("gryffindor")), full("v-sl", slytherin, photo("slytherin"))] as unknown as ProductVariant[]}
      />,
    );
    expect(imageIn(screen.getByRole("link", { name: "Gryffindor" }))!.getAttribute("src")).toContain(`${THUMB}v1789677472/gryffindor.jpg`);
  });

  it("shows only the «Diseño: X» line when the group has a single design", () => {
    render(
      <ProductInfo
        data={current}
        siblings={[variant("v-sl", slytherin, transparente, 3, photo("slytherin")), variant("v-sl-ne", slytherin, negro, 1, photo("slytherin-negro"))]}
      />,
    );
    expect(screen.getByText("Diseño:").parentElement).toHaveTextContent("Diseño: Slytherin");
    expect(screen.queryByRole("link", { name: "Slytherin" })).toBeNull();
    // Los colores siguen ahí.
    expect(screen.getByRole("link", { name: "Seleccionar color Negro" })).toBeInTheDocument();
  });

  it("keeps the single design chip while no design is chosen yet (group page)", () => {
    const groupPage = { ...current, id: "grupo", isGroup: true, design: null, color: null, size: null } as unknown as Product;
    render(<ProductInfo data={groupPage} siblings={[variant("v-sl", slytherin, transparente, 3, photo("slytherin")), variant("v-sl-ne", slytherin, negro, 1, photo("slytherin-negro"))]} />);
    expect(screen.getByText("elige uno")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Slytherin" })).toBeInTheDocument();
  });
});
