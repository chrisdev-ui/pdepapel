// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ toggleFilter: vi.fn(), selectedBrands: [] as string[] }));

vi.mock("@/components/ui/cloudinary-image", () => ({
  CloudinaryImage: ({ alt, src, loading, width, height }: { alt: string; src: string; loading?: string; width: number; height: number }) => (
    <img alt={alt} src={src} data-loading={loading} width={width} height={height} />
  ),
}));
vi.mock("@/hooks/use-product-filters", () => ({
  useProductFilters: () => ({
    filters: { typeId: [], categoryId: [], colorId: [], sizeId: [], designId: [], optionValueId: [], marca: mocks.selectedBrands },
    toggleFilter: mocks.toggleFilter,
    setFilter: vi.fn(),
    setFilters: vi.fn(),
  }),
}));
vi.mock("@/lib/customer-analytics", () => ({ trackCustomerEvent: vi.fn() }));
vi.mock("@/components/shop/collapsible-intro", () => ({ CollapsibleIntro: ({ text }: { text: string }) => <p>{text}</p> }));

import { BrandChipRow } from "@/components/brands/brand-chip-row";
import { BrandEmptyState } from "@/components/brands/brand-empty-state";
import { BrandHeader } from "@/components/brands/brand-header";
import { BrandLines } from "@/components/brands/brand-lines";
import { BrandMenuStrip, BrandMenuTiles, toMenuBrands } from "@/components/brands/brand-menu";
import { BrandPill } from "@/components/brands/brand-pill";
import Filter from "@/components/filter";
import { ProductDetailsAccordion } from "@/components/product-details-accordion";
import type { BrandSummary, Product, PublicBrand } from "@/types";

const LOGO = "https://res.cloudinary.com/demo/image/upload/v1/logo.png";

const summary = (slug: string, name: string, overrides: Partial<BrandSummary> = {}): BrandSummary => ({
  id: `id-${slug}`,
  name,
  slug,
  logoUrl: LOGO,
  logoHasBackground: false,
  logoPermission: "ALLOWED",
  color: null,
  seoText: null,
  isFeatured: false,
  sortOrder: 0,
  productCount: 3,
  parent: null,
  ...overrides,
});

const publicBrand = (overrides: Partial<PublicBrand> = {}): PublicBrand => ({
  name: "Marca Uno",
  slug: "marca-uno",
  logoUrl: LOGO,
  logoHasBackground: false,
  logoPermission: "ALLOWED",
  color: null,
  isPublic: true,
  parent: null,
  ...overrides,
});

afterEach(cleanup);

describe("fila de marcas de la tienda", () => {
  const brands = [summary("marca-uno", "Marca Uno"), summary("marca-dos", "Marca Dos", { logoPermission: "PENDING" })];

  it("son enlaces sin precarga; la elegida lleva aria-current y su enlace la quita", () => {
    render(<BrandChipRow brands={brands} searchParams={{ marca: "marca-uno", colorId: "c1" }} />);
    const uno = screen.getByRole("link", { name: "Marca Uno" });
    const dos = screen.getByRole("link", { name: "Marca Dos" });
    expect(uno).toHaveAttribute("aria-current", "true");
    expect(uno).toHaveAttribute("href", "/tienda?colorId=c1");
    expect(dos).not.toHaveAttribute("aria-current");
    expect(dos).toHaveAttribute("href", "/tienda?colorId=c1&marca=marca-uno,marca-dos");
    expect(screen.getByRole("link", { name: /Ver todas/ })).toHaveAttribute("href", "/marcas");
  });

  it("logo junto al nombre con alt vacío y carga diferida; sin permiso, solo el nombre", () => {
    render(<BrandChipRow brands={brands} searchParams={{}} />);
    const logos = document.querySelectorAll("img");
    expect(logos).toHaveLength(1);
    expect(logos[0]).toHaveAttribute("alt", "");
    expect(logos[0]).toHaveAttribute("loading", "lazy");
    // Una sola URL de Cloudinary a 2× la caja de 44 px: sin srcset ni componente de cliente.
    expect(logos[0]).not.toHaveAttribute("srcset");
    expect(logos[0].getAttribute("src")).toContain("/f_auto,q_auto,c_limit,w_128/");
    expect(within(screen.getByRole("link", { name: "Marca Dos" })).queryByRole("img")).toBeNull();
  });

  it("sin marcas no pinta nada", () => {
    const { container } = render(<BrandChipRow brands={[]} searchParams={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ficha del producto", () => {
  it("«Original <Marca> ›» lleva a la página de la marca, con el logo sin alt", () => {
    render(<BrandPill brand={publicBrand()} />);
    const link = screen.getByRole("link", { name: /Original Marca Uno/ });
    expect(link).toHaveAttribute("href", "/marcas/marca-uno");
    expect(within(link).getByRole("presentation")).toHaveAttribute("loading", "lazy");
  });

  it("con logo negado, la píldora es solo texto", () => {
    render(<BrandPill brand={publicBrand({ logoPermission: "DENIED" })} />);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByRole("link", { name: /Original Marca Uno/ })).toBeInTheDocument();
  });

  const product = (brand: PublicBrand | null) =>
    ({ id: "p", name: "Producto", description: "", sku: "SKU-1", brand, category: { id: "c", name: "Cuadernos", typeId: "t" } }) as unknown as Product;

  it("Detalles: la marca pública es un enlace de texto, sin logo", async () => {
    const user = userEvent.setup();
    render(<ProductDetailsAccordion product={product(publicBrand())} />);
    await user.click(screen.getByRole("button", { name: /Detalles y medidas/ }));
    const link = screen.getByRole("link", { name: "Marca Uno" });
    expect(link).toHaveAttribute("href", "/marcas/marca-uno");
    expect(within(link).queryByRole("img")).toBeNull();
  });

  it("Detalles: una línea con madre visible dice «Marca» (la madre) y «Línea», en texto", async () => {
    const user = userEvent.setup();
    const line = publicBrand({ name: "Flower Power", slug: "flower-power", parent: { name: "Primavera", slug: "primavera", isPublic: true } });
    render(<ProductDetailsAccordion product={product(line)} />);
    await user.click(screen.getByRole("button", { name: /Detalles y medidas/ }));
    expect(screen.getByText("Marca")).toBeInTheDocument();
    expect(screen.getByText("Línea")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Primavera" })).toHaveAttribute("href", "/marcas/primavera");
    expect(screen.getByRole("link", { name: "Flower Power" })).toHaveAttribute("href", "/marcas/flower-power");
    expect(document.querySelector("dl img")).toBeNull();
  });

  it("Detalles: con la madre oculta, solo «Marca» con la línea", async () => {
    const user = userEvent.setup();
    const line = publicBrand({ name: "Flower Power", slug: "flower-power", parent: { name: "Primavera", slug: "primavera", isPublic: false } });
    render(<ProductDetailsAccordion product={product(line)} />);
    await user.click(screen.getByRole("button", { name: /Detalles y medidas/ }));
    expect(screen.getByRole("link", { name: "Flower Power" })).toHaveAttribute("href", "/marcas/flower-power");
    expect(screen.queryByText("Línea")).toBeNull();
    expect(screen.queryByText("Primavera")).toBeNull();
  });

  it("Detalles: una marca oculta no aparece", async () => {
    const user = userEvent.setup();
    render(<ProductDetailsAccordion product={product(publicBrand({ isPublic: false }))} />);
    await user.click(screen.getByRole("button", { name: /Detalles y medidas/ }));
    expect(screen.queryByText("Marca")).toBeNull();
    expect(screen.queryByText("Marca Uno")).toBeNull();
  });
});

describe("página de la marca", () => {
  const page = { ...summary("marca-uno", "Marca Uno", { seoText: "Texto de prueba.", color: "#FFD6E5" }), categories: [{ id: "c1", name: "Cuadernos", slug: "cuadernos", count: 2 }, { id: "c2", name: "Agendas", slug: "agendas", count: 1 }], lines: [] };

  it("cabecera: logo con el nombre como alt, conteo, texto, color y subcategorías como enlaces", () => {
    render(<BrandHeader brand={page} count={4} activeCategoryId="c2" />);
    expect(screen.getByRole("heading", { level: 1, name: "Marca Uno" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Marca Uno" })).toHaveAttribute("data-loading", "lazy");
    expect(screen.getByText("4 productos")).toBeInTheDocument();
    expect(screen.getByText("Texto de prueba.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Todo" })).toHaveAttribute("href", "/marcas/marca-uno");
    expect(screen.getByRole("link", { name: "Agendas" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Agendas" })).toHaveAttribute("href", "/marcas/marca-uno?categoryId=c2");
    expect(document.querySelector("section")?.getAttribute("style")).toContain("background-color");
  });

  it("cabecera de una línea: «Una línea de <Madre>» con enlace a la madre; sin madre no lo dice", () => {
    const { unmount } = render(<BrandHeader brand={{ ...page, name: "Flower Power", slug: "flower-power", parent: { name: "Primavera", slug: "primavera" } }} count={4} />);
    expect(screen.getByText(/Una línea de/)).toHaveTextContent("Una línea de Primavera");
    expect(screen.getByRole("link", { name: "Primavera" })).toHaveAttribute("href", "/marcas/primavera");
    unmount();
    render(<BrandHeader brand={page} count={4} />);
    expect(screen.queryByText(/Una línea de/)).toBeNull();
  });

  it("marca madre: líneas como enlaces con logo (o nombre sin permiso) y conteo", () => {
    render(
      <BrandLines
        brandName="Primavera"
        lines={[
          { name: "Flower Power", slug: "flower-power", logoUrl: LOGO, logoPermission: "ALLOWED", productCount: 12 },
          { name: "Otra Línea", slug: "otra-linea", logoUrl: LOGO, logoPermission: "PENDING", productCount: 1 },
        ]}
      />,
    );
    expect(screen.getByRole("navigation", { name: "Líneas" })).toBeInTheDocument();
    const flower = screen.getByRole("link", { name: "Flower Power: 12 productos" });
    expect(flower).toHaveAttribute("href", "/marcas/flower-power");
    expect(flower.querySelector("img")).toHaveAttribute("loading", "lazy");
    expect(flower).toHaveTextContent("12");
    const otra = screen.getByRole("link", { name: "Otra Línea: 1 producto" });
    expect(otra).toHaveAttribute("href", "/marcas/otra-linea");
    expect(otra.querySelector("img")).toBeNull();
    expect(otra).toHaveTextContent("Otra Línea1");
  });

  it("marca sin líneas: no pinta la fila", () => {
    const { container } = render(<BrandLines brandName="Primavera" lines={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("sin productos: «Sin productos por ahora», sin subcategorías, y el estado vacío lleva a la tienda", () => {
    render(
      <>
        <BrandHeader brand={{ ...page, logoUrl: null }} count={null} />
        <BrandEmptyState />
      </>,
    );
    expect(screen.getByText("Sin productos por ahora")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Todo" })).toBeNull();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByRole("heading", { name: "Pronto tendremos productos de esta marca" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver toda la tienda" })).toHaveAttribute("href", "/tienda");
  });
});

describe("menú", () => {
  it("cajón: solo nombres como enlaces, sin imágenes; «Ver todas» a /marcas; solo lo que se pinta", () => {
    const menu = toMenuBrands([
      summary("marca-uno", "Marca Uno"),
      summary("marca-dos", "Marca Dos", { logoUrl: null }),
      ...["a", "b", "c", "d"].map((slug) => summary(slug, `Marca ${slug}`)),
    ]);
    expect(menu).toHaveLength(5);
    expect(Object.keys(menu[0]).sort()).toEqual(["name", "slug"]);

    render(<BrandMenuTiles brands={menu} />);
    expect(screen.getByRole("link", { name: "Marca Uno" })).toHaveAttribute("href", "/marcas/marca-uno");
    expect(screen.getByRole("link", { name: "Marca Dos" })).toHaveAttribute("href", "/marcas/marca-dos");
    expect(document.querySelectorAll("img")).toHaveLength(0);
    expect(screen.getByRole("link", { name: "Ver todas" })).toHaveAttribute("href", "/marcas");
  });

  it("franja de escritorio: solo nombres, sin imágenes", () => {
    render(<BrandMenuStrip brands={[{ name: "Marca Uno", slug: "marca-uno" }]} />);
    expect(screen.getByRole("link", { name: "Marca Uno" })).toHaveAttribute("href", "/marcas/marca-uno");
    expect(document.querySelectorAll("img")).toHaveLength(0);
  });
});

describe("filtro «Marca» de la barra lateral y la hoja", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectedBrands = [];
    window.sessionStorage.clear();
  });

  const items = [
    { id: "marca-uno", name: "Marca Uno", count: 4, logoUrl: LOGO },
    { id: "marca-dos", name: "Marca Dos", count: 2, logoUrl: null },
  ];

  it("casillas con etiqueta, logo junto al nombre, conteo, y el orden del panel", async () => {
    const user = userEvent.setup();
    render(<Filter valueKey="marca" name="Marca" data={[...items].reverse()} keepOrder />);
    const labels = screen.getAllByRole("checkbox").map((box) => box.getAttribute("id"));
    expect(labels[0]).toContain("marca-dos");
    expect(document.querySelectorAll("img")).toHaveLength(1);
    expect(document.querySelector("img")).toHaveAttribute("alt", "");
    expect(screen.queryByRole("searchbox")).toBeNull();

    await user.click(screen.getByLabelText("Marca Uno"));
    expect(mocks.toggleFilter).toHaveBeenCalledWith("marca", "marca-uno");
  });

  it("buscador solo con más de ocho marcas", () => {
    const many = Array.from({ length: 9 }, (_, index) => ({ id: `m${index}`, name: `Marca ${index}`, count: 1 }));
    render(<Filter valueKey="marca" name="Marca" data={many} keepOrder />);
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });
});
