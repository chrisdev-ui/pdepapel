/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import Features from "@/components/features";
import { Footer } from "@/components/footer";

describe("business location messaging", () => {
  afterEach(cleanup);

  it("explains the Medellín origin and national delivery coverage", () => {
    render(
      <>
        <Features />
        <Footer />
      </>,
    );

    expect(screen.getAllByText("Envíos nacionales").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Desde Medellín enviamos a toda Colombia.").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText("Operamos desde Medellín, Colombia"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Tienda online con envíos a todo el país"),
    ).toBeInTheDocument();
  });

  it("renders an accessible, mobile-friendly footer structure", () => {
    render(<Footer />);

    expect(
      screen.getByRole("link", {
        name: "Ir al inicio de Papelería P de Papel",
      }),
    ).toHaveAttribute("href", "/");
    expect(
      screen.getByRole("heading", { name: "Contáctenos", level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Términos Legales", level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Redes Sociales", level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Visitar Instagram de Papelería P de Papel",
      }),
    ).toHaveClass("h-11", "w-11");
    expect(
      screen.getByRole("link", {
        name: "Visitar TikTok de Papelería P de Papel",
      }),
    ).toHaveClass("h-11", "w-11");
    expect(
      screen.getByRole("link", { name: "Políticas de entrega" }),
    ).toHaveClass("min-h-[44px]");
    expect(
      screen.getByRole("button", { name: "Preferencias de privacidad" }),
    ).toHaveClass("min-h-[44px]");
  });
});
