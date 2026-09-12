// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import NotFound from "@/app/not-found";
import RouteError from "@/app/(routes)/error";
import OrderNotFound from "@/app/(routes)/pedido/[orderId]/not-found";
import RetiredQuotePage from "@/app/(public)/cotizacion/[token]/page";
import { UpstreamUnavailable } from "@/components/upstream-unavailable";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const WHATSAPP = "https://wa.me/573132582293?text=";

describe("error and not-found boundaries", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("root 404 offers the shop, WhatsApp and home", () => {
    render(<NotFound />);

    expect(screen.getByRole("heading", { level: 1, name: "No encontramos esta página" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a la tienda" })).toHaveAttribute("href", "/tienda");
    expect(screen.getByRole("link", { name: /Escribir por WhatsApp/ })).toHaveAttribute(
      "href",
      expect.stringContaining(WHATSAPP),
    );
    expect(screen.getByRole("link", { name: "Volver al inicio" })).toHaveAttribute("href", "/");
  });

  it("order 404 sends the customer to Mis pedidos", () => {
    render(<OrderNotFound />);

    expect(screen.getByRole("heading", { level: 1, name: "No encontramos este pedido" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a Mis pedidos" })).toHaveAttribute("href", "/mis-pedidos");
  });

  it("retired quote links explain the change and offer the shop and WhatsApp", () => {
    render(<RetiredQuotePage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Esta cotización ya no está disponible" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a la tienda" })).toHaveAttribute("href", "/tienda");
    expect(screen.getByRole("link", { name: /Escribir por WhatsApp/ })).toHaveAttribute(
      "href",
      expect.stringContaining(WHATSAPP),
    );
    expect(screen.getByRole("link", { name: "Volver al inicio" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("button", { name: /Aceptar/ })).not.toBeInTheDocument();
  });

  it("route error retries through reset() and shows the digest for support", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    const reset = vi.fn();
    const error = Object.assign(new Error("boom"), { digest: "a1f9c2" });

    render(<RouteError error={error} reset={reset} />);

    expect(screen.getByRole("heading", { level: 1, name: "Algo salió mal de nuestro lado" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Intentar de nuevo/ }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByText("a1f9c2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Escribir por WhatsApp/ })).toHaveAttribute(
      "href",
      expect.stringContaining(encodeURIComponent("Código: a1f9c2")),
    );
    expect(console.error).toHaveBeenCalledWith(error);
  });

  it("upstream fallback keeps the retry tone and never blames the cart", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    const reset = vi.fn();

    render(<UpstreamUnavailable error={new Error("upstream")} reset={reset} />);

    expect(screen.getByRole("heading", { level: 1, name: "Estamos actualizando la tienda" })).toBeInTheDocument();
    expect(screen.getByText(/Tu carrito no se modificó/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Reintentar/ }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Ver la tienda" })).toHaveAttribute("href", "/tienda");
  });
});
