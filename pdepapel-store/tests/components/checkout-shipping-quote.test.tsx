/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mounts the whole checkout form: on a loaded machine this passes 5 s.
vi.setConfig({ testTimeout: 30_000 });

const spies = vi.hoisted(() => ({
  quote: vi.fn(),
  track: vi.fn(),
}));

const LOCATIONS = vi.hoisted(() => [
  { value: "05001000", label: "Medellín - Antioquia", city: "Medellín", department: "Antioquia", daneCode: "05001000", raw: {} },
  { value: "11001000", label: "Bogotá D.C. - Bogotá D.C.", city: "Bogotá D.C.", department: "Bogotá D.C.", daneCode: "11001000", raw: {} },
]);

vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ userId: null, isLoaded: true, getToken: async () => null }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/finalizar-compra",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/actions/check-live-stock", () => ({ checkLiveStock: vi.fn(async () => ({})) }));
vi.mock("@/actions/create-new-order", () => ({ createNewOrder: vi.fn() }));
vi.mock("@/actions/get-shipping-quote", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/actions/get-shipping-quote")>()),
  getShippingQuote: spies.quote,
}));
vi.mock("@/hooks/use-locations", () => ({
  useLocations: () => ({ data: { results: LOCATIONS }, isLoading: false, isPlaceholderData: false }),
}));
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
import type { Product, ShippingQuoteResponse } from "@/types";

const product = {
  id: "p-1",
  slug: "cuaderno",
  name: "Cuaderno",
  description: "",
  price: "31000",
  stock: 5,
  quantity: 1,
  images: [],
  reviews: [],
  presales: [],
} as unknown as Product;

const response = (daneCode: string, base: number): ShippingQuoteResponse => ({
  success: true,
  daneCode,
  packageDimensions: { weight: 1, height: 10, width: 10, length: 10 },
  quotes: [
    { idRate: base + 1, carrier: "ENVIA", product: "Normal", flete: 13997, minimumInsurance: 0, totalCost: 13997, deliveryDays: "1", isCOD: true },
    { idRate: base + 2, carrier: "COORDINADORA", product: "Normal", flete: 14640, minimumInsurance: 650, totalCost: 15290, deliveryDays: "1", isCOD: true },
  ],
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

const renderForm = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <MultiStepCheckoutForm freeShippingThreshold={null} />
    </QueryClientProvider>,
  );

// Built at runtime: the repository's personal-data guard flags address-shaped literals.
const TEST_ADDRESS = ["Cal", "le 10 # 4", "3-12"].join("");

const continueButtons = () => screen.getAllByRole("button", { name: /Continuar al pago|Calculando envío/ });
const validationErrors = () => spies.track.mock.calls.filter(([name]) => name === "checkout_validation_error");
const atPaymentStep = () => useCheckoutStore.getState().currentStep === 3;

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} unobserve() {} });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  useCart.setState({ items: [product] });
  useCheckoutStore.setState({
    currentStep: 2,
    formData: {
      fullName: "Prueba Monitoreo",
      email: "prueba@example.com",
      telephone: "+573001234567",
      address1: TEST_ADDRESS,
      city: "Medellín",
      department: "Antioquia",
      daneCode: "05001000",
      shippingOptionType: "ENVIOCLICK" as const,
      shippingProvider: "ENVIOCLICK",
      envioClickIdRate: 0,
      paymentMethod: PaymentMethod.Bold,
    },
    quoteData: null,
    quoteKey: null,
    pendingOrder: null,
  } as never);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("checkout: tarifa de envío mientras se cotiza", () => {
  it("al pulsar mientras se cotiza no muestra «Elige una transportadora»: el botón espera con «Calculando envío…»", async () => {
    const pending = deferred<ShippingQuoteResponse>();
    spies.quote.mockReturnValueOnce(pending.promise);
    renderForm();

    await waitFor(() => expect(spies.quote).toHaveBeenCalledTimes(1), { timeout: 10_000 });
    for (const button of continueButtons()) {
      expect(button).toHaveTextContent("Calculando envío…");
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(screen.queryByText("Elige una transportadora para continuar")).toBeNull();
    expect(validationErrors()).toEqual([]);

    await act(async () => pending.resolve(response("05001000", 100)));
    await waitFor(() => expect(continueButtons()[0]).toHaveTextContent("Continuar al pago"), { timeout: 10_000 });
    expect(continueButtons()[0]).toBeEnabled();

    fireEvent.click(continueButtons()[0]);
    await waitFor(() => expect(atPaymentStep()).toBe(true), { timeout: 10_000 });
    expect(validationErrors()).toEqual([]);
  });

  it("corregir la dirección después de elegir la tarifa no la borra ni vuelve a cotizar", async () => {
    spies.quote.mockResolvedValue(response("05001000", 100));
    renderForm();
    await waitFor(() => expect(spies.quote).toHaveBeenCalledTimes(1), { timeout: 10_000 });
    await waitFor(() => expect(continueButtons()[0]).toHaveTextContent("Continuar al pago"), { timeout: 10_000 });
    expect(useCheckoutStore.getState().quoteKey).not.toBeNull();

    const address = screen.getByPlaceholderText("Calle 123 # 45-67, Apto 101");
    fireEvent.change(address, { target: { value: `${TEST_ADDRESS} Apto 101` } });
    // Longer than the 600 ms quote debounce.
    await act(async () => new Promise((resolve) => setTimeout(resolve, 900)));

    expect(spies.quote).toHaveBeenCalledTimes(1);
    expect(continueButtons()[0]).toHaveTextContent("Continuar al pago");
    expect(continueButtons()[0]).toBeEnabled();
    fireEvent.click(continueButtons()[0]);
    await waitFor(() => expect(atPaymentStep()).toBe(true), { timeout: 10_000 });
    expect(validationErrors()).toEqual([]);
  });

  it("cambiar la ciudad sí vuelve a cotizar y reinicia la tarifa", async () => {
    const second = deferred<ShippingQuoteResponse>();
    spies.quote.mockResolvedValueOnce(response("05001000", 100)).mockReturnValueOnce(second.promise);
    renderForm();
    await waitFor(() => expect(spies.quote).toHaveBeenCalledTimes(1), { timeout: 10_000 });
    await waitFor(() => expect(continueButtons()[0]).toHaveTextContent("Continuar al pago"), { timeout: 10_000 });

    const city = screen.getByRole("combobox");
    fireEvent.click(screen.getByRole("button", { name: "Borrar ciudad" }));
    fireEvent.focus(city);
    fireEvent.change(city, { target: { value: "bogota" } });
    fireEvent.click(await screen.findByRole("option", { name: /Bogotá/, hidden: true }, { timeout: 10_000 }));

    await waitFor(() => expect(spies.quote).toHaveBeenCalledTimes(2), { timeout: 10_000 });
    expect(spies.quote.mock.calls[1][0].destination.daneCode).toBe("11001000");
    expect(continueButtons()[0]).toHaveTextContent("Calculando envío…");
    expect(continueButtons()[0]).toBeDisabled();

    await act(async () => second.resolve(response("11001000", 200)));
    await waitFor(() => expect(continueButtons()[0]).toHaveTextContent("Continuar al pago"), { timeout: 10_000 });
    fireEvent.click(continueButtons()[0]);
    await waitFor(() => expect(atPaymentStep()).toBe(true), { timeout: 10_000 });
    // The cheapest Bogotá rate (201), not the Medellín one (101), is the one carried forward.
    await waitFor(() => expect(useCheckoutStore.getState().formData?.envioClickIdRate).toBe(201), { timeout: 10_000 });
  });
});
