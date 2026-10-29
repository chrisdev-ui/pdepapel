/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Montan el formulario completo (o un import diferido): en una máquina cargada pasan de 5 s.
vi.setConfig({ testTimeout: 30_000 });

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/customer-analytics", () => ({
  trackCustomerEvent: track,
  toAnalyticsItem: (product: { id: string; name: string }, quantity: number) => ({ item_id: product.id, item_name: product.name, quantity }),
  getAnalyticsValue: () => 0,
}));
vi.mock("@/providers/cart-preview-provider", () => ({ useCartPreview: () => ({ markCartTouched: vi.fn(), showCartPreview: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));

import { ProductInfo } from "@/components/product-info";
import { useCart } from "@/hooks/use-cart";
import { usePresaleCartConflict } from "@/hooks/use-presale-cart-conflict";
import { useWishlist } from "@/hooks/use-wishlist";
import type { Product } from "@/types";

const presale = (overrides: Record<string, unknown> = {}) => ({
  id: "ps",
  expectedArrivalAt: "2026-12-05T17:00:00.000Z",
  expectedArrivalText: null,
  unitLimit: null,
  committedUnits: 3,
  paymentMode: "DEPOSIT",
  depositType: "FIXED",
  depositValue: 30000,
  termsText: "Incluye 24 ventanas sorpresa.",
  ...overrides,
});

const calendar = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "cal",
    slug: "calendario-adviento",
    name: "Calendario de adviento",
    description: "",
    price: "160000",
    stock: 0,
    sku: "CAL-ADV",
    images: [],
    reviews: [],
    presales: [presale()],
    ...overrides,
  }) as unknown as Product;

const RESERVED = ["source", "medium", "campaign", "campaign_id", "term", "content"];

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  useWishlist.setState({ items: [], guestItems: [], accountUserId: null, isHydrated: true });
  useCart.setState({ items: [] });
  usePresaleCartConflict.setState({ pending: null });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("ficha de una preventa con anticipo", () => {
  it("precio completo, anticipo y saldo bajo el precio, la fecha y el botón con el anticipo × cantidad", () => {
    render(<ProductInfo data={calendar()} quantity={2} />);
    expect(screen.getByTestId("presale-deposit-teaser")).toHaveTextContent(
      "Resérvalo hoy con $ 30.000 de anticipo · Saldo de $ 130.000 + envío cuando llegue",
    );
    expect(screen.getByTestId("presale-deposit-teaser")).toHaveTextContent("Fecha estimada: 5 de diciembre");
    expect(screen.getByText("$ 160.000")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: /Reservar con anticipo/ });
    expect(button).toHaveTextContent("Reservar con anticipo · $ 60.000");
    expect(screen.queryByText(/Quedan/)).toBeNull();
    expect(screen.queryByText(/Pagas el total hoy/)).toBeNull();
    expect(screen.queryByText(/puedes pedir tu dinero de vuelta/)).toBeNull();
  });

  it("«Cómo funciona la preventa» es un <details> con las reglas, el texto de la campaña y el enlace a los términos", () => {
    const { container } = render(<ProductInfo data={calendar()} />);
    const details = screen.getByTestId("presale-how-it-works");
    expect(details.tagName).toBe("DETAILS");
    expect(container.querySelector("summary")).toHaveTextContent("Cómo funciona la preventa");
    const rules = Array.from(details.querySelectorAll("li")).map((item) => item.textContent!.replace(/\s+/g, " "));
    expect(rules).toEqual([
      "Hoy pagas un anticipo de $ 30.000 por unidad y tu producto queda apartado.",
      "Cuando llegue te escribimos para coordinar el pago del saldo y el envío; ahí lo despachamos.",
      "El precio queda fijo desde que reservas.",
      "Solo los primeros $ 30.000 por unidad no son reembolsables, salvo el derecho de retracto de ley o si el producto no llega; lo abonado por encima se devuelve o queda como saldo a favor. Si el producto no llega, te devolvemos todo.",
      "La preventa se compra sola: no se mezcla con otros productos en el mismo pedido.",
    ]);
    expect(details).toHaveTextContent("Incluye 24 ventanas sorpresa.");
    expect(screen.getByRole("link", { name: "Ver condiciones completas" })).toHaveAttribute("href", "/politicas/terminos#preventas");
  });

  it("ofrece la lista de espera en la ficha", async () => {
    render(<ProductInfo data={calendar()} />);
    expect(screen.getByRole("heading", { name: "¿Prefieres esperar? Te avisamos cuando llegue" })).toBeInTheDocument();
    expect(await screen.findByRole("form", { name: "Avísame de la preventa de Calendario de adviento" }, { timeout: 10_000 })).toBeInTheDocument();
  });

  it("con el cupo lleno, la lista de espera reemplaza al botón (sin el boletín)", async () => {
    render(<ProductInfo data={calendar({ presales: [presale({ unitLimit: 3, committedUnits: 3 })] })} />);
    expect(screen.queryByRole("button", { name: /Reservar con anticipo/ })).toBeNull();
    // Sin cupo no se ofrece el anticipo: ni el texto bajo el precio, ni las reglas, ni la medición.
    expect(screen.queryByTestId("presale-deposit-teaser")).toBeNull();
    expect(screen.queryByTestId("presale-how-it-works")).toBeNull();
    expect(track.mock.calls.some(([name]) => name === "preorder_view")).toBe(false);
    expect(await screen.findByRole("form", { name: /Avísame de la preventa/ }, { timeout: 10_000 })).toBeInTheDocument();
  });

  it("GA4 preorder_view una vez, sin nombres reservados ni datos personales", () => {
    render(<ProductInfo data={calendar()} />);
    const calls = track.mock.calls.filter(([name]) => name === "preorder_view");
    expect(calls).toHaveLength(1);
    const params = calls[0][1] as Record<string, unknown>;
    expect(params).toEqual({ currency: "COP", items: [{ item_id: "cal", item_name: "Calendario de adviento", quantity: 1 }], deposit_value: 30000, has_eta: true });
    for (const key of RESERVED) expect(params).not.toHaveProperty(key);
    expect(JSON.stringify(params)).not.toMatch(/@|\+57|email|phone|telefono|direccion/i);
  });

  it("una preventa completa no manda preorder_view ni muestra el anticipo", () => {
    render(<ProductInfo data={calendar({ presales: [presale({ paymentMode: "FULL", unitLimit: 40 })] })} />);
    expect(track.mock.calls.some(([name]) => name === "preorder_view")).toBe(false);
    expect(screen.queryByTestId("presale-deposit-teaser")).toBeNull();
    expect(screen.getByRole("button", { name: /Reservar ahora/ })).toBeInTheDocument();
  });

  it("con otras cosas en el carrito pregunta antes de reservar (no agrega nada)", () => {
    useCart.setState({ items: [{ id: "lapicero", name: "Lapicero", price: "5000", stock: 9, quantity: 1, images: [], reviews: [] } as unknown as Product] });
    render(<ProductInfo data={calendar()} />);
    fireEvent.click(screen.getByRole("button", { name: /Reservar con anticipo/ }));
    expect(usePresaleCartConflict.getState().pending?.product.id).toBe("cal");
    expect(useCart.getState().items.map((item) => item.id)).toEqual(["lapicero"]);
  });
});
