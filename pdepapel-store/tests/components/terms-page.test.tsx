// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import PrivacyPage from "@/app/(routes)/politicas/privacidad/page";
import TermsPage, { metadata } from "@/app/(routes)/politicas/terminos/page";
import { STOREFRONT_ROUTES } from "@/lib/routes";

/** Lo que va después de «Responsable…:» en el párrafo del responsable. */
const responsibleData = () => screen.getByTestId("responsable").textContent!.replace(/\s+/g, " ").split(": ").slice(1).join(": ").trim();

describe("Términos y condiciones", () => {
  afterEach(cleanup);

  it("tiene sus secciones en orden, la fecha y ningún marcador sin llenar", () => {
    const { container } = render(<TermsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Términos y condiciones de P de Papel" })).toBeInTheDocument();
    expect(screen.getByText("3 de noviembre de 2026")).toBeInTheDocument();
    const article = container.querySelector("article") ?? container;
    const titles = within(article as HTMLElement).getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(titles.slice(0, 14)).toEqual([
      "Quiénes somos",
      "Uso del sitio",
      "Productos, precios y disponibilidad",
      "Pedidos y pagos",
      "Preventas y anticipos",
      "Envíos",
      "Cambios, devoluciones y derecho de retracto",
      "Garantía legal",
      "Reversión del pago",
      "Peticiones, quejas y reclamos",
      "Datos personales",
      "Propiedad intelectual",
      "Cambios a estos términos",
      "Ley aplicable",
    ]);
    expect(container.textContent).not.toMatch(/\[[^\]]+\]/);
    expect(metadata.alternates?.canonical).toBe(STOREFRONT_ROUTES.termsPolicy);
  });

  it("enlaza las políticas y las cápsulas por sus rutas reales", () => {
    const { container } = render(<TermsPage />);
    const hrefs = Array.from(container.querySelectorAll("section a")).map((link) => link.getAttribute("href"));
    for (const route of [STOREFRONT_ROUTES.shippingPolicy, STOREFRONT_ROUTES.returnsPolicy, STOREFRONT_ROUTES.dataPolicy, STOREFRONT_ROUTES.capsules]) {
      expect(hrefs).toContain(route);
    }
    expect(container.querySelector("#peticiones-quejas-reclamos")).not.toBeNull();
  });

  // 2026-11-03: cápsulas en combos para lives y la tienda; rango aprobado por Paula.
  it("dice qué trae una cápsula sorpresa: rango de precio, sin escoger y la regla del agotado", () => {
    const { container } = render(<TermsPage />);
    const text = container.querySelector("#productos-precios")!.textContent!.replace(/\s+/g, " ");
    expect(text).toContain("Las cápsulas sorpresa se venden en combos desde 5 cápsulas, al precio que ves en cada combo.");
    expect(text).toContain("Cada cápsula trae un papel con el nombre de un producto sorpresa de la tienda, con un precio en la tienda de entre $5.000 y $35.000.");
    expect(text).toContain("No se puede escoger el contenido y puede repetirse entre cápsulas.");
    expect(text).toContain("Si el producto de tu papel se agotó, te enviamos otro de igual o mayor precio y te avisamos cuál.");
    expect(text).toContain("Las ediciones de cápsulas de /capsulas tienen además las condiciones que aparecen en su página.");
  });

  it("tiene la sección de preventas con anticipo que enlaza el checkout (#preventas)", () => {
    const { container } = render(<TermsPage />);
    const section = container.querySelector("#preventas");
    expect(section).not.toBeNull();
    const text = section!.textContent!.replace(/\s+/g, " ");
    expect(text).toContain("Preventas y anticipos");
    expect(text).toContain("Solo el anticipo no es reembolsable");
    expect(text).toContain("lo abonado por encima se devuelve o queda como saldo a favor");
    expect(text).toContain("salvo el derecho de retracto de ley o si el producto no llega");
    expect(text).toContain("te devolvemos el 100 % de lo que pagaste, incluido el anticipo");
    expect(text).toContain("dentro del plazo que te indiquemos al avisarte");
    expect(text).toContain("El envío se cotiza y se paga con el saldo.");
    expect(text).not.toMatch(/\[N\]/);
  });

  it("nombra al mismo responsable que la política de datos", () => {
    render(<TermsPage />);
    const terms = responsibleData();
    cleanup();
    render(<PrivacyPage />);
    expect(screen.getByText("26 de octubre de 2026")).toBeInTheDocument();
    expect(responsibleData()).toBe(terms);
    expect(terms).toMatch(/^Paula Fernanda Morales Rodriguez \(nombre comercial: Papelería P de Papel\), NIT .+ Dirección de notificación: .+ Contacto: papeleria\.pdepapel@gmail\.com\.$/);
  });
});
