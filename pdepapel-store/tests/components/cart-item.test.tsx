/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/CldImage", () => ({ CldImage: (props: React.ComponentProps<"img">) => <img {...props} /> }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import { CartItem } from "@/app/(routes)/carrito/components/cart-item";
import { useCart } from "@/hooks/use-cart";
import { useWishlist } from "@/hooks/use-wishlist";
import type { Product } from "@/types";

const product = { id: "p1", slug: "washi", name: "Washi pastel x6", price: "13000", quantity: 3, stock: 5, originalPrice: 15000, hasDiscount: true, images: [], reviews: [], design: { id: "d", name: "Pastel", value: "" } } as unknown as Product;

beforeEach(() => {
  useCart.setState({ items: [product] });
  useWishlist.setState({ items: [], guestItems: [], accountUserId: null, isHydrated: true });
});
afterEach(cleanup);

describe("CartItem", () => {
  it("shows the line total, the unit price and the savings for the quantity", () => {
    render(<ul><CartItem item={product} onRemove={() => {}} /></ul>);
    expect(screen.getByText("$ 39.000")).toBeInTheDocument();
    expect(screen.getByText(/13\.000 c\/u/)).toBeInTheDocument();
    expect(screen.getByText(/Ahorras/)).toHaveTextContent("6.000");
    expect(screen.getByText("Diseño: Pastel")).toBeInTheDocument();
  });

  it("moves the product to favorites when saved for later", () => {
    render(<ul><CartItem item={product} onRemove={() => {}} /></ul>);
    fireEvent.click(screen.getByRole("button", { name: "Guardar para después" }));
    expect(useWishlist.getState().items.map((item) => item.id)).toEqual(["p1"]);
    expect(useCart.getState().items).toHaveLength(0);
  });

  it("flags a price that changed since it was added and stock problems", () => {
    render(<ul><CartItem item={{ ...product, stock: 0 }} priceChange={{ from: 15000, to: 13000 }} onRemove={() => {}} /></ul>);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Agotado");
    expect(status).toHaveTextContent("El precio bajó de $ 15.000 a $ 13.000");
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("labels the remove control with the product name", () => {
    const onRemove = vi.fn();
    render(<ul><CartItem item={product} onRemove={onRemove} /></ul>);
    fireEvent.click(screen.getByRole("button", { name: "Quitar Washi pastel x6 del carrito" }));
    expect(onRemove).toHaveBeenCalledWith("p1");
  });
});
