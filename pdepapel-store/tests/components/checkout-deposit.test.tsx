/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Montan el formulario completo (o un import diferido): en una máquina cargada pasan de 5 s.
vi.setConfig({ testTimeout: 30_000 });

const spies = vi.hoisted(() => ({
  checkout: vi.fn(),
  createOrder: vi.fn(),
  track: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ userId: null, isLoaded: true, getToken: async () => null }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: spies.push, replace: spies.replace }),
  usePathname: () => "/finalizar-compra",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/actions/check-live-stock", () => ({ checkLiveStock: vi.fn(async () => ({})) }));
vi.mock("@/actions/checkout-order", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/actions/checkout-order")>()),
  checkoutOrder: spies.checkout,
}));
vi.mock("@/actions/create-new-order", () => ({ createNewOrder: spies.createOrder }));
vi.mock("@/lib/customer-analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/customer-analytics")>()),
  trackCustomerEvent: spies.track,
  getGoogleAnalyticsClientId: async () => null,
  getGoogleAnalyticsSessionId: async () => null,
}));
vi.mock("@/lib/analytics/tiktok", () => ({ trackTikTokEvent: vi.fn(), tiktokProductParameters: () => ({}) }));
vi.mock("@/hooks/use-confetti", () => ({ useConfetti: () => ({ fireConfetti: vi.fn() }) }));
vi.mock("@/components/welcome-benefit-card", () => ({ WelcomeBenefitCard: () => null }));
vi.mock("@/components/bot-trap", () => ({
  useBotTrap: () => ({ fields: async () => ({}) }),
  BotTrapField: () => null,
  BotChallengeSlot: () => null,
}));

import { MultiStepCheckoutForm } from "@/app/(routes)/finalizar-compra/components/multi-step-checkout-form";
import { PaymentMethod } from "@/constants";
import { useCart } from "@/hooks/use-cart";
import { useCheckoutStore } from "@/hooks/use-checkout-store";
import type { Product } from "@/types";

const calendar = (quantity = 1) =>
  ({
    id: "cal",
    slug: "calendario",
    name: "Calendario de adviento",
    description: "",
    price: "160000",
    stock: 0,
    quantity,
    images: [],
    reviews: [],
    presales: [
      { id: "ps", expectedArrivalAt: null, expectedArrivalText: null, unitLimit: null, committedUnits: 0, paymentMode: "DEPOSIT", depositType: "FIXED", depositValue: 30000, termsText: null },
    ],
  }) as unknown as Product;

const storedForm = {
  fullName: "Ana Pérez",
  email: "ana@prueba.test",
  telephone: "+573001234567",
  address1: "Calle 1 # 2-3",
  city: "Medellín",
  department: "Antioquia",
  daneCode: "05001000",
  // Lo que quedó de una compra anterior: no debe colarse en la reserva.
  couponCode: "HOLA10",
  shippingOptionType: "ENVIOCLICK" as const,
  shippingProvider: "ENVIOCLICK",
  envioClickIdRate: 77,
  shipping: { carrierName: "ENVIA", courier: "ENVIA", productName: "Normal", flete: 18000, minimumInsurance: 0, deliveryDays: 3, isCOD: true, cost: 18000, status: "Preparing" },
  paymentMethod: PaymentMethod.Bold,
};

const renderForm = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <MultiStepCheckoutForm freeShippingThreshold={100000} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} unobserve() {} });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  useCart.setState({ items: [calendar(1)] });
  useCheckoutStore.setState({
    currentStep: 3,
    formData: storedForm,
    couponState: { coupon: { code: "HOLA10", type: "FIXED", amount: 10000, isActive: true, minOrderValue: 0 } as never, isValid: true },
    pendingOrder: null,
  });
  spies.checkout.mockResolvedValue({ id: "o-1", orderNumber: "ORD-1", status: "PENDING", paymentPlan: "DEPOSIT", depositAmount: 30000, total: 160000 });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const submitButton = () => screen.getAllByRole("button", { name: /Pagar anticipo/ })[0];

describe("checkout de una preventa con anticipo", () => {
  it("el botón dice «Pagar anticipo $30.000» y no se puede pagar sin marcar la casilla", async () => {
    renderForm();
    const checkbox = (await screen.findByTestId("deposit-terms-checkbox", undefined, { timeout: 10_000 })) as HTMLInputElement;
    expect(checkbox.type).toBe("checkbox");
    expect(checkbox.checked).toBe(false);
    expect(checkbox.closest("label")!.textContent!.replace(/\s+/g, " ")).toContain(
      "Acepto las condiciones de la preventa: hoy pago un anticipo de $ 30.000; el saldo y el envío los pago cuando llegue el producto. Solo el anticipo no es reembolsable, salvo el derecho de retracto de ley o si el producto no llega; lo abonado por encima se devuelve o queda como saldo a favor.",
    );
    expect(within(checkbox.closest("label")!).getByRole("link")).toHaveAttribute("href", "/politicas/terminos#preventas");

    expect(submitButton()).toHaveTextContent("Pagar anticipo $ 30.000");
    expect(submitButton()).toBeDisabled();
    fireEvent.click(checkbox);
    await waitFor(() => expect(submitButton()).toBeEnabled(), { timeout: 10_000 });
  });

  it("solo «Pago en línea» y «Transferencia bancaria», sin cupón ni tarjeta de regalo", async () => {
    renderForm();
    await screen.findByTestId("deposit-terms-checkbox", undefined, { timeout: 10_000 });
    expect(screen.queryByText(/Contra entrega/i)).toBeNull();
    expect(screen.getAllByText(/Pago en línea/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Transferencia bancaria/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("deposit-no-coupon-note")).toHaveTextContent("Una preventa con anticipo no lleva cupón ni tarjeta de regalo.");
    expect(screen.queryByText(/¿Tienes un cupón/)).toBeNull();
    expect(screen.queryByText(/Tarjeta de regalo/)).toBeNull();
  });

  it("el resumen: total del producto, saldo al llegar y lo que se paga hoy", async () => {
    renderForm();
    await screen.findByTestId("deposit-terms-checkbox", undefined, { timeout: 10_000 });
    expect(screen.getAllByTestId("checkout-deposit-balance")[0]).toHaveTextContent(/130\.000 \+ envío/);
    expect(screen.getAllByText("Pagas hoy (anticipo)")[0].nextSibling).toHaveTextContent("30.000");
    expect(screen.getAllByText("El envío se cotiza y se paga con el saldo.").length).toBeGreaterThan(0);
  });

  it("envía la casilla y su versión, envío manual en 0, total = subtotal, sin cupón ni tarjeta; la transferencia va a /checkout", async () => {
    useCheckoutStore.setState({ formData: { ...storedForm, paymentMethod: PaymentMethod.BankTransfer } });
    renderForm();
    fireEvent.click(await screen.findByTestId("deposit-terms-checkbox", undefined, { timeout: 10_000 }));
    await waitFor(() => expect(submitButton()).toBeEnabled(), { timeout: 10_000 });
    await act(async () => {
      fireEvent.click(submitButton());
    });
    await waitFor(() => expect(spies.checkout).toHaveBeenCalledTimes(1), { timeout: 10_000 });
    expect(spies.createOrder).not.toHaveBeenCalled();
    const [payload] = spies.checkout.mock.calls[0];
    expect(payload).toMatchObject({
      preorderTermsAccepted: true,
      preorderTermsVersion: "2026-10-29",
      couponCode: null,
      giftCardCode: null,
      subtotal: 160000,
      total: 160000,
      envioClickIdRate: 0,
      payment: { method: PaymentMethod.BankTransfer },
      shipping: { provider: "CUSTOM", cost: 0, carrierName: "Se cotiza cuando llegue (se paga con el saldo)" },
    });
  });

  it("entrega: solo la dirección, sin cotizar, con «El envío se cotiza y se paga con el saldo»", async () => {
    useCheckoutStore.setState({ currentStep: 2 });
    renderForm();
    expect(await screen.findByTestId("deposit-shipping-note", undefined, { timeout: 10_000 })).toHaveTextContent("El envío se cotiza y se paga con el saldo.");
    expect(screen.queryByText(/¿Cómo quieres recibirlo\?/)).toBeNull();
    expect(screen.queryByText(/Transportadora \*/)).toBeNull();
    expect(screen.getByLabelText(/Dirección/)).toBeInTheDocument();
    // El envío guardado de otra visita (EnvioClick, tarifa 77) se cambia por el de la reserva.
    await waitFor(
      () =>
        expect(useCheckoutStore.getState().formData).toMatchObject({
          shippingOptionType: "PRESALE_DEPOSIT",
          envioClickIdRate: 0,
          couponCode: "",
        }),
      { timeout: 3000 },
    );
  });

  it("un carrito normal no hereda el envío de una reserva anterior", async () => {
    useCart.setState({ items: [{ id: "lapicero", slug: "lapicero", name: "Lapicero", price: "5000", stock: 9, quantity: 1, images: [], reviews: [] } as unknown as Product] });
    useCheckoutStore.setState({ currentStep: 2, formData: { ...storedForm, shippingOptionType: "PRESALE_DEPOSIT", envioClickIdRate: 0 } as never });
    renderForm();
    await waitFor(() => expect(useCheckoutStore.getState().formData).toMatchObject({ shippingOptionType: "ENVIOCLICK" }), { timeout: 3000 });
    expect(screen.queryByTestId("deposit-shipping-note")).toBeNull();
  });

  it("GA4: begin_checkout con el anticipo y preorder_deposit_start, sin nombres reservados", async () => {
    renderForm();
    await screen.findByTestId("deposit-terms-checkbox", undefined, { timeout: 10_000 });
    const start = spies.track.mock.calls.find(([name]) => name === "preorder_deposit_start");
    const begin = spies.track.mock.calls.find(([name]) => name === "begin_checkout");
    expect(start?.[1]).toMatchObject({ currency: "COP", value: 30000 });
    expect(begin?.[1]).toMatchObject({ value: 30000 });
    for (const key of ["source", "medium", "campaign", "campaign_id", "term", "content"]) {
      expect(start?.[1]).not.toHaveProperty(key);
    }
    expect(JSON.stringify(start?.[1])).not.toMatch(/ana@prueba|3001234567|Pérez|Calle 1/);
  });
});
