// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductFilters } from "@/hooks/use-product-filters";
import { EMPTY_FILTERS } from "@/lib/shop-filters";
import type { Product, ProductsResponse } from "@/types";

const mocks = vi.hoisted(() => ({
  filters: {} as ProductFilters,
  setFilters: vi.fn(),
  sidebar: vi.fn(),
  products: vi.fn(),
  fetchCatalog: vi.fn(),
}));

vi.mock("@/hooks/use-product-filters", () => ({
  useProductFilters: () => ({ filters: mocks.filters, setFilters: mocks.setFilters, setFilter: vi.fn(), toggleFilter: vi.fn() }),
}));
vi.mock("@/lib/catalog-client", () => ({ fetchCatalogFromClient: mocks.fetchCatalog }));
vi.mock("@/lib/customer-analytics", () => ({ trackCustomerEvent: vi.fn(), toAnalyticsItem: vi.fn(() => ({})) }));
vi.mock("@/components/mobile-filters", () => ({ default: () => null }));
vi.mock("@/components/shop/save-search-button", () => ({ SaveSearchButton: () => null }));
vi.mock("@/components/shop/shop-sidebar", () => ({
  ShopSidebar: (props: unknown) => {
    mocks.sidebar(props);
    return null;
  },
}));
vi.mock("@/components/shop/shop-toolbar", () => ({
  MobileToolbar: () => null,
  ShopToolbar: ({ brandLine, rangeText }: { brandLine?: ReactNode; rangeText: string }) => <p data-testid="range">{brandLine ?? rangeText}</p>,
}));
vi.mock("@/app/(routes)/tienda/components/products", () => ({
  default: (props: { hideBrand?: boolean }) => {
    mocks.products(props);
    return null;
  },
}));
vi.mock("@/app/(routes)/tienda/components/shop-search-bar", () => ({ default: () => null }));

import { ShopContent } from "@/components/shop-content";

const product = { id: "p1", name: "Producto", price: "1000", stock: 1, images: [], reviews: [] } as unknown as Product;
const facets: ProductsResponse["facets"] = {
  colors: [],
  formattedSizes: [],
  categories: [],
  designs: [],
  brands: [
    { id: "marca-uno", name: "Marca Uno", count: 2, logoUrl: "https://res.cloudinary.com/demo/uno.png", logoHasBackground: false, logoPermission: "PENDING" },
    { id: "marca-dos", name: "Marca Dos", count: 1, logoUrl: "https://res.cloudinary.com/demo/dos.png", logoHasBackground: false, logoPermission: "ALLOWED" },
  ],
};

function renderShop(extra: Partial<Parameters<typeof ShopContent>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(shopTree(client, extra));
}

function shopTree(client: QueryClient, extra: Partial<Parameters<typeof ShopContent>[0]> = {}) {
  return (
    <QueryClientProvider client={client}>
      <a href="/tienda?marca=marca-uno" data-brand-chip="marca-uno">
        Marca Uno
      </a>
      <a href="/tienda?marca=marca-dos" data-brand-chip="marca-dos">
        Marca Dos
      </a>
      <ShopContent
        initialProducts={[product]}
        initialTotalPages={1}
        initialTotalItems={5}
        initialFacets={facets}
        types={[]}
        categories={[]}
        catalogOptions={[]}
        colors={[]}
        designs={[]}
        brands={[{ id: "marca-tres", name: "Marca Tres" }]}
        {...extra}
      />
    </QueryClientProvider>
  );
}

const lastSidebarBrands = () => (mocks.sidebar.mock.calls.at(-1)?.[0] as { brands: { id: string; logoUrl: string | null; count: number }[] }).brands;

describe("ShopContent y las marcas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.filters = { ...EMPTY_FILTERS, sortOption: "" };
    mocks.fetchCatalog.mockResolvedValue({ products: [product], totalPages: 1, totalItems: 5, facets });
    window.history.replaceState(null, "", "/tienda");
  });
  afterEach(cleanup);

  it("el filtro «Marca» sale de la faceta, con el logo solo si hay permiso, y conserva la elegida sin resultados", () => {
    mocks.filters = { ...mocks.filters, marca: ["marca-tres"] };
    renderShop();
    expect(lastSidebarBrands()).toEqual([
      { id: "marca-uno", name: "Marca Uno", count: 2, logoUrl: null },
      { id: "marca-dos", name: "Marca Dos", count: 1, logoUrl: "https://res.cloudinary.com/demo/dos.png" },
      { id: "marca-tres", name: "Marca Tres", count: 0, logoUrl: null },
    ]);
  });

  it("con una sola marca: «N productos de X · Quitar» y las tarjetas sin la línea de marca", () => {
    mocks.filters = { ...mocks.filters, marca: ["marca-uno"] };
    renderShop();
    expect(screen.getByTestId("range")).toHaveTextContent("5 productos de Marca Uno · Quitar");
    expect(mocks.products).toHaveBeenLastCalledWith(expect.objectContaining({ hideBrand: true }));

    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    expect(mocks.setFilters).toHaveBeenCalledWith({ marca: [], page: 1 });
  });

  it("mientras llega la lista de la marca no pega el total anterior a su nombre", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(shopTree(client));
    expect(screen.getByTestId("range")).not.toHaveTextContent("Marca Uno");
    mocks.fetchCatalog.mockReturnValue(new Promise(() => {}));
    mocks.filters = { ...mocks.filters, marca: ["marca-uno"] };
    view.rerender(shopTree(client));
    await waitFor(() => expect(screen.getByTestId("range")).toHaveTextContent("Buscando productos de Marca Uno · Quitar"));
    expect(mocks.fetchCatalog).toHaveBeenCalled();
  });

  it("con dos marcas las tarjetas sí dicen su marca", () => {
    mocks.filters = { ...mocks.filters, marca: ["marca-uno", "marca-dos"] };
    renderShop();
    expect(screen.getByTestId("range")).toHaveTextContent("5 productos de Marca Uno y Marca Dos");
    expect(mocks.products).toHaveBeenLastCalledWith(expect.objectContaining({ hideBrand: false }));
  });

  it("los chips del servidor siguen a la URL: marca elegida y enlaces con los demás filtros", async () => {
    window.history.replaceState(null, "", "/tienda?colorId=c1&marca=marca-dos");
    mocks.filters = { ...mocks.filters, colorId: ["c1"], marca: ["marca-dos"] };
    renderShop();
    await act(async () => {});
    const [uno, dos] = Array.from(document.querySelectorAll("a[data-brand-chip]"));
    expect(uno).not.toHaveAttribute("aria-current");
    expect(dos).toHaveAttribute("aria-current", "true");
    expect(uno).toHaveAttribute("href", "/tienda?colorId=c1&marca=marca-dos,marca-uno");
    expect(dos).toHaveAttribute("href", "/tienda?colorId=c1");
  });

  it("un clic normal en un chip cambia el filtro en el sitio; con modificador queda el enlace", async () => {
    renderShop();
    await act(async () => {});
    const chip = document.querySelector("a[data-brand-chip='marca-uno']") as HTMLAnchorElement;

    const modified = new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true });
    chip.dispatchEvent(modified);
    expect(modified.defaultPrevented).toBe(false);
    expect(mocks.setFilters).not.toHaveBeenCalled();

    const plain = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    chip.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(true);
    const update = mocks.setFilters.mock.calls.at(-1)?.[0] as (previous: ProductFilters) => ProductFilters;
    expect(update({ ...EMPTY_FILTERS, page: 4 })).toMatchObject({ marca: ["marca-uno"], page: 1 });
    expect(update({ ...EMPTY_FILTERS, marca: ["marca-uno"] })).toMatchObject({ marca: [] });
  });

  it("en la página de una marca, la marca va fija, sin barra lateral y sin línea de marca", () => {
    renderShop({ fixedBrandSlug: "marca-uno", showFilters: false });
    expect(mocks.sidebar).not.toHaveBeenCalled();
    expect(mocks.products).toHaveBeenLastCalledWith(expect.objectContaining({ hideBrand: true }));
    expect(screen.getByTestId("range")).not.toHaveTextContent("Quitar");
  });
});
