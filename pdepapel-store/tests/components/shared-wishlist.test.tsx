/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/product-card", () => ({ default: ({ product }: { product: { name: string } }) => <div>{product.name}</div> }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import { SharedWishlist } from "@/app/(routes)/favoritos/components/shared-wishlist";
import { useWishlist, WishlistProduct } from "@/hooks/use-wishlist";
import type { Product } from "@/types";

const product = (id: string, name: string) => ({ id, name, price: "1000", stock: 2, images: [], reviews: [] }) as unknown as Product;

beforeEach(() => {
  useWishlist.setState({ items: [{ ...product("a", "Washi"), addedOn: new Date() } as WishlistProduct], guestItems: [], accountUserId: null, isHydrated: true });
});
afterEach(cleanup);

describe("SharedWishlist", () => {
  it("saves only the products the visitor does not have yet", () => {
    render(<SharedWishlist products={[product("a", "Washi"), product("b", "Libreta")]} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("2 productos");
    fireEvent.click(screen.getByRole("button", { name: /Guardar los 1 que faltan/ }));
    expect(useWishlist.getState().items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(screen.getByRole("button", { name: "Ya están en tus favoritos" })).toBeDisabled();
  });
});
