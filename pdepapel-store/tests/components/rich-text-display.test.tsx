/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * La razón de ser del componente nuevo: si algo de su grafo vuelve a importar
 * `sanitize-html` (y con él `entities`, `postcss`, `htmlparser2`, ~65 KB gzip
 * en la ficha de producto), esta prueba revienta antes que el paquete.
 */
vi.mock("sanitize-html", () => {
  throw new Error("RichTextDisplay no debe cargar sanitize-html en el navegador");
});

import { RichTextDisplay } from "@/components/ui/rich-text-display";

afterEach(cleanup);

describe("RichTextDisplay", () => {
  it("pinta el HTML saneado tal cual llega, sin rehacer el saneado", () => {
    const html =
      '<p style="color: #DB2777">Hola <strong>mundo</strong> <a href="https://example.com/" target="_blank" rel="noopener noreferrer">Externo</a></p>';
    const { container } = render(<RichTextDisplay html={html} />);
    const prose = container.querySelector(".prose");
    expect(prose?.innerHTML).toBe(html);
    expect(screen.getByRole("link", { name: "Externo" })).toHaveAttribute("target", "_blank");
  });

  it("enseña el texto de respaldo cuando no hay nada que leer", () => {
    render(<RichTextDisplay html="" fallback="Pronto habrá descripción." />);
    expect(screen.getByText("Pronto habrá descripción.")).toBeInTheDocument();
  });

  it("un HTML con etiquetas y sin texto también cuenta como vacío", () => {
    render(<RichTextDisplay html="<p></p><ul><li> </li></ul>" />);
    expect(screen.getByText("Sin descripción")).toBeInTheDocument();
    expect(document.querySelector(".prose")).toBeNull();
  });
});
