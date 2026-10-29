/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { track, openSheet } = vi.hoisted(() => ({ track: vi.fn(), openSheet: vi.fn() }));
vi.mock("@/lib/customer-analytics", () => ({
  trackCustomerEvent: track,
  toAnalyticsItem: (product: { id: string }, quantity: number) => ({ item_id: product.id, quantity }),
  getAnalyticsValue: () => 0,
}));
vi.mock("@/hooks/use-cart-sheet", () => ({ useCartSheet: (selector: (state: { open: typeof openSheet }) => unknown) => selector({ open: openSheet }) }));

import { PresaleCartConflictDialog } from "@/components/presale-cart-conflict-dialog";
import { useCart } from "@/hooks/use-cart";
import { usePresaleCartConflict } from "@/hooks/use-presale-cart-conflict";
import type { Product } from "@/types";

const normal = { id: "lapicero", name: "Lapicero", price: "5000", stock: 9, images: [], reviews: [] } as unknown as Product;
const calendar = {
  id: "cal",
  name: "Calendario de adviento",
  price: "160000",
  stock: 0,
  images: [],
  reviews: [],
  presales: [{ id: "ps", expectedArrivalAt: null, unitLimit: null, committedUnits: 0, paymentMode: "DEPOSIT", depositType: "FIXED", depositValue: 30000 }],
} as unknown as Product;

beforeEach(() => {
  useCart.setState({ items: [{ ...normal, quantity: 1 }] });
});
afterEach(() => {
  cleanup();
  usePresaleCartConflict.setState({ pending: null });
  vi.clearAllMocks();
});

describe("preventa con anticipo en un carrito con otras cosas", () => {
  it("pregunta antes de vaciar y «Mantener mi carrito» no toca nada", () => {
    usePresaleCartConflict.getState().ask({ product: calendar, quantity: 2, uiSource: "product_detail" });
    render(<PresaleCartConflictDialog />);
    expect(screen.getByText("La preventa se paga aparte. ¿Vaciar el carrito y reservar solo Calendario de adviento?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mantener mi carrito" }));
    expect(usePresaleCartConflict.getState().pending).toBeNull();
    expect(useCart.getState().items.map((item) => item.id)).toEqual(["lapicero"]);
  });

  it("«Vaciar y reservar» deja solo la preventa con su cantidad", () => {
    usePresaleCartConflict.getState().ask({ product: calendar, quantity: 2, uiSource: "product_detail" });
    render(<PresaleCartConflictDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Vaciar y reservar" }));
    expect(useCart.getState().items.map((item) => [item.id, item.quantity])).toEqual([["cal", 2]]);
    expect(track).toHaveBeenCalledWith("add_to_cart", expect.objectContaining({ ui_source: "product_detail" }));
    expect(openSheet).toHaveBeenCalledWith("cal");
  });

  it("al revés (algo entra a un carrito con la preventa) pregunta por ese producto", () => {
    useCart.setState({ items: [{ ...calendar, quantity: 1 }] });
    usePresaleCartConflict.getState().ask({ product: normal, quantity: 1, uiSource: "product_card" });
    render(<PresaleCartConflictDialog />);
    expect(screen.getByText("La preventa se paga aparte. ¿Vaciar el carrito y agregar solo Lapicero?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Vaciar y agregar" }));
    expect(useCart.getState().items.map((item) => item.id)).toEqual(["lapicero"]);
  });
});
