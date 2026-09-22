/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ProductCard from "@/components/ui/product-card";
import type { Product } from "@/types";

vi.mock("@/lib/customer-analytics", () => ({
  trackCustomerEvent: vi.fn(),
  toAnalyticsItem: vi.fn(() => ({})),
  getAnalyticsValue: vi.fn(() => 0),
}));
vi.mock("@/components/ui/cloudinary-image", () => ({
  CloudinaryImage: ({ alt }: { alt: string }) => <img alt={alt} />,
}));
vi.mock("@/providers/cart-preview-provider", () => ({
  useCartPreview: () => ({ showCartPreview: vi.fn() }),
}));

const base = {
  id: "p1",
  slug: "cuaderno-snoopy",
  name: "Cuaderno 5 materias Snoopy A5 argollado",
  price: "21250",
  originalPrice: 25000,
  stock: 8,
  images: [{ id: "i1", url: "https://res.cloudinary.com/demo/a.jpg", isMain: true }],
  category: { id: "c1", typeId: "t1", name: "Cuadernos" },
  reviews: [{ id: "r1", userId: "u", name: "Ana", rating: 5, comment: "" }],
} as unknown as Product;

describe("ProductCard", () => {
  afterEach(cleanup);

  const lastButton = (name: string | RegExp) => screen.getAllByRole("button", { name }).at(-1)!;

  /**
   * Entre tocar la foto y ver la ficha pasaban ~839 ms medidos en escritorio
   * —más en un teléfono— sin que cambiara nada en pantalla, así que la
   * reacción normal era volver a tocar. El enlace nunca estuvo roto: lo que
   * faltaba era decir «ya te oí».
   */
  describe("señal al abrir el producto", () => {
    const enlace = () => screen.getByRole("link", { name: /^Ver / });

    it("no enseña nada hasta que la tocan", () => {
      render(<ProductCard product={base} />);
      expect(document.querySelector('[data-opening="true"]')).toBeNull();
    });

    it("al tocarla se apaga y sale la rueda", () => {
      render(<ProductCard product={base} />);
      fireEvent.click(enlace(), { button: 0 });
      expect(document.querySelector('[data-opening="true"]')).not.toBeNull();
    });

    /**
     * Con Cmd/Ctrl o el botón central, la pestaña actual se queda donde está:
     * encender la rueda dejaría la tarjeta apagada para siempre.
     */
    it("abrir en otra pestaña no la apaga", () => {
      render(<ProductCard product={base} />);
      fireEvent.click(enlace(), { button: 0, metaKey: true });
      expect(document.querySelector('[data-opening="true"]')).toBeNull();
      fireEvent.click(enlace(), { button: 1 });
      expect(document.querySelector('[data-opening="true"]')).toBeNull();
    });

    /** El enlace sigue siendo un enlace: no se intercepta la navegación. */
    it("no toca el comportamiento del enlace", () => {
      render(<ProductCard product={base} />);
      const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
      enlace().dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    });
  });

  it("shows the offer badge, the struck price and a working add button", () => {
    render(<ProductCard product={base} />);
    expect(screen.getByText("15 % OFF")).toBeInTheDocument();
    expect(screen.getAllByText(/25\.000/).length).toBeGreaterThan(0);
    expect(lastButton("Agregar al carrito")).toBeEnabled();
    expect(screen.getByLabelText(/Calificación 5 de 5/)).toBeInTheDocument();
  });

  it("puts sold out in the commercial slot and disables purchase while keeping the discount", () => {
    render(<ProductCard product={{ ...base, stock: 0 }} />);
    expect(screen.getByText("Agotado")).toBeInTheDocument();
    expect(screen.queryByText("15 % OFF")).not.toBeInTheDocument();
    expect(screen.getAllByText(/25\.000/).length).toBeGreaterThan(0);
    expect(lastButton("Agotado")).toBeDisabled();
  });

  it("moves «Nuevo» next to the category when the catalog slot holds the options badge", () => {
    render(<ProductCard product={{ ...base, isGroup: true, variantCount: 4, minPrice: 4500, maxPrice: 9000, originalPrice: undefined }} isNew />);
    expect(screen.getByText("4 opciones")).toBeInTheDocument();
    expect(screen.queryByText("¡Nuevo!")).not.toBeInTheDocument();
    expect(screen.getByText("· Nuevo")).toBeInTheDocument();
    expect(screen.getByText("Desde")).toBeInTheDocument();
    expect(lastButton("Elegir opción")).toBeEnabled();
  });

  it("shows the low stock chip and the coming-soon state", () => {
    const { rerender } = render(<ProductCard product={{ ...base, stock: 2, originalPrice: undefined }} />);
    expect(screen.getByText("¡Quedan 2!")).toBeInTheDocument();

    rerender(<ProductCard product={{ ...base, availableAt: "2999-10-01T05:00:00.000Z", originalPrice: undefined }} />);
    expect(screen.getByText(/Llega el/)).toBeInTheDocument();
    expect(lastButton("Llega pronto")).toBeDisabled();
    expect(screen.queryByText("¡Quedan 2!")).not.toBeInTheDocument();
  });
});
