// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { Truck } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";

import { PolicyPage } from "@/components/policy/policy-page";
import { STOREFRONT_ROUTES } from "@/lib/routes";

const sections = [
  { id: "tiempos", title: "Tiempos de entrega", content: <p>Dos a cuatro días.</p> },
  { id: "costo", title: "Costo del envío", content: <p>Lo ves antes de pagar.</p> },
];

describe("PolicyPage", () => {
  afterEach(cleanup);

  it("renders the hero, the anchored sections and the update date", () => {
    render(
      <PolicyPage
        eyebrow="Política de envíos"
        eyebrowIcon={Truck}
        eyebrowClassName="bg-kawaii-mint-light"
        title="Envíos y entregas"
        lede="Cómo recibir tu pedido."
        updatedAt="2026-09-09"
        sections={sections}
        contactPrompt="¿Dudas?"
        currentRoute={STOREFRONT_ROUTES.shippingPolicy}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Envíos y entregas" })).toBeInTheDocument();
    expect(screen.getByText("9 de septiembre de 2026")).toBeInTheDocument();
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Tiempos de entrega",
      "Costo del envío",
      "¿Dudas?",
    ]);
    expect(document.getElementById("tiempos")).not.toBeNull();
  });

  it("links every section from the table of contents and the other two policies", () => {
    render(
      <PolicyPage
        eyebrow="Política de envíos"
        eyebrowIcon={Truck}
        eyebrowClassName=""
        title="Envíos y entregas"
        lede=""
        updatedAt="2026-09-09"
        sections={sections}
        contactPrompt="¿Dudas?"
        currentRoute={STOREFRONT_ROUTES.shippingPolicy}
      />,
    );

    const tocs = screen.getAllByRole("navigation", { name: "Contenido de la política" });
    expect(tocs.length).toBeGreaterThan(0);
    const desktopToc = tocs[tocs.length - 1];
    expect(within(desktopToc).getByRole("link", { name: "Tiempos de entrega" })).toHaveAttribute("href", "#tiempos");
    expect(within(desktopToc).getByRole("link", { name: "Cambios y devoluciones" })).toHaveAttribute(
      "href",
      STOREFRONT_ROUTES.returnsPolicy,
    );
    expect(within(desktopToc).getByRole("link", { name: "Datos personales" })).toHaveAttribute(
      "href",
      STOREFRONT_ROUTES.dataPolicy,
    );
    expect(within(desktopToc).queryByRole("link", { name: "Envíos y entregas" })).toBeNull();
  });

  it("always ends with the WhatsApp and email contact block", () => {
    render(
      <PolicyPage
        eyebrow="Datos"
        eyebrowIcon={Truck}
        eyebrowClassName=""
        title="Datos"
        lede=""
        updatedAt="2026-09-09"
        sections={sections}
        contactPrompt="¿Tienes una duda sobre tus datos?"
        currentRoute={STOREFRONT_ROUTES.dataPolicy}
      />,
    );

    expect(screen.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "Correo" })).toHaveAttribute(
      "href",
      "mailto:papeleria.pdepapel@gmail.com",
    );
  });
});
