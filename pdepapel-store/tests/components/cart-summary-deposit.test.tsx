/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push, validate, toast } = vi.hoisted(() => ({ push: vi.fn(), validate: vi.fn(), toast: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/carrito" }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ getToken: async () => null }), SignedOut: () => null, SignedIn: () => null }));
vi.mock("@/hooks/use-validate-coupon", () => ({ default: () => ({ mutate: validate, status: "idle" }) }));
vi.mock("@/hooks/use-toast", () => ({ toast }));
vi.mock("@/providers/storefront-settings-provider", () => ({ useStorefrontSettings: () => ({ freeShippingThreshold: 120000 }) }));
vi.mock("@/components/account-prompt", () => ({ AccountPrompt: () => null }));

import { Summary } from "@/app/(routes)/carrito/components/summary";
import { useCart } from "@/hooks/use-cart";
import { useCheckoutStore } from "@/hooks/use-checkout-store";
import type { Coupon, Product } from "@/types";

const calendar = (quantity: number) =>
  ({
    id: "cal",
    name: "Calendario de adviento",
    price: "160000",
    quantity,
    stock: 0,
    images: [],
    reviews: [],
    presales: [
      { id: "ps", expectedArrivalAt: null, expectedArrivalText: null, unitLimit: null, committedUnits: 0, paymentMode: "DEPOSIT", depositType: "FIXED", depositValue: 30000, termsText: null },
    ],
  }) as unknown as Product;

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  useCart.setState({ items: [calendar(1)] });
  useCheckoutStore.setState({ couponState: { coupon: null, isValid: null } });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("resumen del carrito con una preventa con anticipo", () => {
  it("muestra el total del producto, lo que se paga hoy y el saldo al llegar", () => {
    render(<Summary />);
    expect(screen.getByText("Total del producto").nextSibling).toHaveTextContent("160.000");
    expect(screen.getByText("Pagas hoy (anticipo)").nextSibling).toHaveTextContent("30.000");
    expect(screen.getByText("Saldo al llegar").nextSibling).toHaveTextContent(/130\.000 \+ envío/);
    expect(screen.queryByText(/Te faltan/)).toBeNull();
  });

  it("multiplica el anticipo por las unidades", () => {
    useCart.setState({ items: [calendar(3)] });
    render(<Summary />);
    expect(screen.getByTestId("cart-deposit-due-now")).toHaveTextContent("90.000");
    expect(screen.getByText("Saldo al llegar").nextSibling).toHaveTextContent(/390\.000 \+ envío/);
  });

  it("no ofrece cupón y no aplica uno guardado", () => {
    useCheckoutStore.setState({
      couponState: { coupon: { code: "HOLA", type: "FIXED", amount: 10000, isActive: true, minOrderValue: 0 } as unknown as Coupon, isValid: true },
    });
    render(<Summary />);
    expect(screen.getByText("Una preventa con anticipo no lleva cupón ni tarjeta de regalo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /¿Tienes un cupón\?/ })).toBeNull();
    expect(screen.queryByText(/Cupón HOLA/)).toBeNull();
    expect(screen.getByTestId("cart-deposit-due-now")).toHaveTextContent("30.000");
  });
});
