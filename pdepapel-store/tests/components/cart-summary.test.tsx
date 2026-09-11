/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push, validate, toast } = vi.hoisted(() => ({ push: vi.fn(), validate: vi.fn(), toast: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ getToken: async () => null }), SignedOut: () => null, SignedIn: () => null }));
vi.mock("@/hooks/use-validate-coupon", () => ({ default: () => ({ mutate: validate, status: "idle" }) }));
vi.mock("@/hooks/use-toast", () => ({ toast }));
vi.mock("@/providers/storefront-settings-provider", () => ({ useStorefrontSettings: () => ({ freeShippingThreshold: 120000 }) }));
vi.mock("@/components/account-prompt", () => ({ AccountPrompt: () => null }));

import { Summary } from "@/app/(routes)/carrito/components/summary";
import { useCart } from "@/hooks/use-cart";
import { useCheckoutStore } from "@/hooks/use-checkout-store";
import type { Coupon, Product } from "@/types";

const item = (id: string, price: number, quantity: number, originalPrice?: number) =>
  ({ id, name: `Producto ${id}`, price: String(price), quantity, stock: 10, originalPrice, hasDiscount: Boolean(originalPrice), images: [], reviews: [] }) as unknown as Product;

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  useCart.setState({ items: [item("a", 10000, 2), item("b", 15000, 1, 20000)] });
  useCheckoutStore.setState({ couponState: { coupon: null, isValid: null } });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("Summary", () => {
  it("breaks the order down: subtotal with count, savings, shipping note and total", () => {
    render(<Summary />);
    expect(screen.getByText("Subtotal (3 productos)")).toBeInTheDocument();
    expect(screen.getByText("Ahorros en ofertas")).toBeInTheDocument();
    expect(screen.getByText("Se calcula con tu dirección")).toBeInTheDocument();
    expect(screen.getByText(/Te faltan/)).toHaveTextContent("85.000");
    expect(screen.getAllByText("Total")[0].nextSibling).toHaveTextContent("35.000");
  });

  it("validates a coupon and hands it to the checkout state", () => {
    render(<Summary />);
    fireEvent.click(screen.getByRole("button", { name: /¿Tienes un cupón\?/ }));
    fireEvent.change(screen.getByLabelText("Código del cupón"), { target: { value: "hola10" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(validate).toHaveBeenCalledWith({ code: "HOLA10", subtotal: 35000 });
  });

  it("shows an applied coupon as a discount row with a way to remove it", () => {
    useCheckoutStore.setState({
      couponState: { coupon: { code: "HOLA10", type: "PERCENTAGE", amount: 10, isActive: true, minOrderValue: null } as unknown as Coupon, isValid: true },
    });
    render(<Summary />);
    expect(screen.getByText("Cupón HOLA10")).toBeInTheDocument();
    expect(screen.getAllByText("Total")[0].nextSibling).toHaveTextContent("31.500");
    fireEvent.click(screen.getByRole("button", { name: "Quitar cupón HOLA10" }));
    expect(useCheckoutStore.getState().couponState.coupon).toBeNull();
  });

  it("drops an applied coupon with a warning when the cart falls under its minimum", () => {
    useCheckoutStore.setState({
      couponState: { coupon: { id: "c1", code: "GRANDE", type: "FIXED", amount: 5000, isActive: true, minOrderValue: 50000 } as Coupon, isValid: true },
    });
    render(<Summary />);
    expect(useCheckoutStore.getState().couponState.coupon).toBeNull();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("Quitamos el cupón GRANDE") }));
    expect(screen.queryByText("Cupón GRANDE")).not.toBeInTheDocument();
  });

  it("explains why checkout is blocked and disables the button", () => {
    render(<Summary disabledReason="Revisa «Producto a»: está agotado." />);
    expect(screen.getByRole("alert")).toHaveTextContent("está agotado");
    expect(screen.getAllByRole("button", { name: "Finalizar compra" })[0]).toBeDisabled();
  });
});
