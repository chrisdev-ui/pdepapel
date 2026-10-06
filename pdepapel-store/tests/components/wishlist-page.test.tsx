/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({ SignedOut: ({ children }: { children: React.ReactNode }) => <>{children}</>, SignedIn: () => null }));
vi.mock("@/actions/get-products", () => ({ getProducts: vi.fn(async () => ({ products: [] })) }));
vi.mock("@/components/ui/product-card", () => ({ default: ({ product }: { product: { name: string } }) => <div data-testid="card">{product.name}</div> }));
vi.mock("@/components/product-list", () => ({ ProductList: ({ title }: { title: string }) => <div>{title}</div> }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
const catalog = vi.hoisted(() => ({ fetchCatalogFromClient: vi.fn() }));
vi.mock("@/lib/catalog-client", () => ({ fetchCatalogFromClient: catalog.fetchCatalogFromClient }));

import { Wishlist } from "@/app/(routes)/favoritos/components/wishlist";
import { useCart } from "@/hooks/use-cart";
import { useWishlist, WishlistProduct } from "@/hooks/use-wishlist";

const item = (id: string, name: string, stock: number) => ({ id, slug: id, name, price: "5000", stock, images: [], reviews: [], addedOn: new Date("2026-09-02T12:00:00Z") }) as unknown as WishlistProduct;

beforeEach(() => {
  catalog.fetchCatalogFromClient.mockReset().mockResolvedValue({ products: [] });
  useCart.setState({ items: [] });
  useWishlist.setState({ items: [item("a", "Washi pastel", 4), item("b", "Libreta Flower", 0), item("c", "Stickers 3D", 2)], guestItems: [], accountUserId: null, isHydrated: true });
});
afterEach(cleanup);

describe("Wishlist page", () => {
  it("summarizes the list and offers to add every available product at once", () => {
    render(<Wishlist />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Mis favoritos · 3 productos");
    expect(screen.getByText("2 disponibles ahora · 1 agotado")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Agregar los 2 disponibles/ }));
    expect(useCart.getState().items.map((cartItem) => cartItem.id).sort()).toEqual(["a", "c"]);
    expect(useWishlist.getState().items).toHaveLength(3);
  });

  it("shows a notify link for sold-out favorites and a labelled remove control", () => {
    render(<Wishlist />);
    expect(screen.getByRole("link", { name: "Avísame cuando vuelva" })).toHaveAttribute("href", "/producto/b#avisame");
    fireEvent.click(screen.getByRole("button", { name: "Quitar Libreta Flower de favoritos" }));
    expect(useWishlist.getState().items.map((entry) => entry.id)).toEqual(["a", "c"]);
  });

  /**
   * CLS: Clerk confirma la sesión segundos después de pintar. Si el recuadro
   * «Guarda tus favoritos» aparece encima del contenido, lo empuja todo hacia
   * abajo (0,157 en móvil). Va al final, después de las recomendaciones.
   */
  it("puts the account prompt after the favorites and the empty state, never above them", () => {
    const { container, unmount } = render(<Wishlist />);
    const prompt = screen.getByText("Guarda tus favoritos en tu cuenta").closest("aside")!;
    const list = screen.getByRole("list", { name: "Productos favoritos" });
    expect(list.compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.firstElementChild!.lastElementChild).toBe(prompt);
    unmount();

    useWishlist.setState({ items: [], guestItems: [] });
    render(<Wishlist />);
    const empty = screen.getByText("Todavía no tienes favoritos");
    const emptyPrompt = screen.getByText("Guarda tus favoritos en tu cuenta").closest("aside")!;
    expect(empty.compareDocumentPosition(emptyPrompt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders an empty state with category chips", () => {
    useWishlist.setState({ items: [], guestItems: [] });
    render(<Wishlist categories={[{ id: "c1", typeId: "t", name: "🎀 Stickers", slug: "stickers" }]} />);
    expect(screen.getByText("Todavía no tienes favoritos")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Stickers" })).toHaveAttribute("href", "/categoria/stickers");
  });

  /*
   * Un grupo guardado desde la tarjeta sigue siendo la familia después del
   * refresco: nombre del grupo y «Elegir opción», aunque el catálogo por id
   * devuelva la variante que le ponía cara. Un producto simple no cambia.
   */
  it("shows a saved group as the family with «Elegir opción» after the refresh", async () => {
    const familyItem = { ...item("v-naranja", "Kits Básicos de apuntes", 3), slug: "kit-naranja", isGroup: true, productGroupId: "g1", variantCount: 4, savedAsGroup: true } as WishlistProduct;
    useWishlist.setState({ items: [familyItem, item("a", "Washi pastel", 4)], guestItems: [] });
    catalog.fetchCatalogFromClient.mockImplementation(async (query: { ids?: string; groups?: string }) => {
      if (query.groups === "g1") return { products: [{ id: "v-azul", slug: "kit-azul", name: "Kits Básicos de apuntes", price: 17000, stock: 5, images: [], reviews: [], isGroup: true, productGroupId: "g1", variantCount: 5 }] };
      return { products: [
        { id: "v-naranja", slug: "kit-naranja", name: "Kit Básico de apuntes Girly Naranja", price: 18000, stock: 0, images: [], reviews: [], isGroup: false, productGroupId: "g1" },
        { id: "a", slug: "a", name: "Washi pastel", price: "4500", stock: 4, images: [], reviews: [] },
      ] };
    });
    render(<Wishlist />);
    await waitFor(() => expect(useWishlist.getState().items[0].variantCount).toBe(5));
    expect(catalog.fetchCatalogFromClient).toHaveBeenCalledWith(expect.objectContaining({ ids: "a,v-naranja" }), expect.anything());
    expect(catalog.fetchCatalogFromClient).toHaveBeenCalledWith(expect.objectContaining({ groups: "g1" }), expect.anything());
    expect(screen.getAllByTestId("card").map((card) => card.textContent)).toEqual(["Kits Básicos de apuntes", "Washi pastel"]);
    expect(screen.getByRole("link", { name: "Elegir opción" })).toHaveAttribute("href", "/producto/kit-naranja");
    expect(screen.getAllByRole("button", { name: "Agregar al carrito" })).toHaveLength(1);
    expect(useWishlist.getState().items[0]).toMatchObject({ id: "v-naranja", isGroup: true, savedAsGroup: true, price: 17000 });
    // La familia no entra en «agregar todos»: comprar pide la variante.
    expect(screen.getByText(/1 disponible ahora/)).toBeInTheDocument();
  });
});
