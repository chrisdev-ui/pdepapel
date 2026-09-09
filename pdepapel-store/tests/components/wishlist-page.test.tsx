/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({ SignedOut: ({ children }: { children: React.ReactNode }) => <>{children}</>, SignedIn: () => null }));
vi.mock("@/actions/get-products", () => ({ getProducts: vi.fn(async () => ({ products: [] })) }));
vi.mock("@/components/ui/product-card", () => ({ default: ({ product }: { product: { name: string } }) => <div data-testid="card">{product.name}</div> }));
vi.mock("@/components/product-list", () => ({ ProductList: ({ title }: { title: string }) => <div>{title}</div> }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import { Wishlist } from "@/app/(routes)/favoritos/components/wishlist";
import { useCart } from "@/hooks/use-cart";
import { useWishlist, WishlistProduct } from "@/hooks/use-wishlist";

const item = (id: string, name: string, stock: number) => ({ id, slug: id, name, price: "5000", stock, images: [], reviews: [], addedOn: new Date("2026-09-02T12:00:00Z") }) as unknown as WishlistProduct;

beforeEach(() => {
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

  it("renders an empty state with category chips", () => {
    useWishlist.setState({ items: [], guestItems: [] });
    render(<Wishlist categories={[{ id: "c1", typeId: "t", name: "🎀 Stickers", slug: "stickers" }]} />);
    expect(screen.getByText("Todavía no tienes favoritos")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Stickers" })).toHaveAttribute("href", "/categoria/stickers");
  });
});
