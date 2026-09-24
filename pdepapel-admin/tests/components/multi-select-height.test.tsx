// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MultiSelect } from "@/components/ui/multi-select";

/**
 * El alto del recuadro de Tamaños / Colores / Diseños.
 *
 * El disparador nace con `h-auto min-h-10`: 40 px de mínimo para cuadrar con
 * los demás campos, y libertad para crecer cuando las fichas de lo elegido
 * pasan de una línea. El formulario de grupos le pasaba además `h-10`, y
 * `cn()` usa `twMerge`, que ante dos alturas en conflicto se queda con la
 * última: ganaba el alto fijo, las fichas seguían bajando de línea y se
 * salían del recuadro. Con cuatro colores de nombre largo se veía.
 *
 * El plegado de `responsive` («+ N más») no se comprueba aquí: depende del
 * ancho de la ventana y jsdom no hace composición, así que la prueba diría
 * poco. La corrección no toca el componente —solo deja de pasarle un alto
 * fijo desde el formulario—, de modo que ese comportamiento no cambia.
 */
const opciones = [
  { label: "Rosa pastel", value: "c1" },
  { label: "Azul pastel", value: "c2" },
  { label: "Verde menta pastel", value: "c3" },
  { label: "Amarillo mantequilla", value: "c4" },
  { label: "Lila lavanda", value: "c5" },
];

const disparador = () => screen.getByRole("combobox");

afterEach(cleanup);

describe("alto del MultiSelect", () => {
  it("sin override puede crecer: conserva h-auto y su mínimo", () => {
    render(
      <MultiSelect
        options={opciones}
        value={["c1", "c2", "c3", "c4"]}
        onValueChange={vi.fn()}
        placeholder="Elige colores…"
        variant="secondary"
        responsive
      />,
    );
    const clases = disparador().className;
    expect(clases).toContain("h-auto");
    expect(clases).toContain("min-h-10");
  });

  /**
   * Esto es lo que hacía el formulario de grupos. Se deja escrito para que se
   * vea por qué no se debe volver a pasar una altura fija: `twMerge` se queda
   * con la última y `h-auto` desaparece.
   */
  it("con un alto fijo encima, `h-auto` se pierde (el fallo que se corrigió)", () => {
    render(
      <MultiSelect
        options={opciones}
        value={["c1", "c2", "c3", "c4"]}
        onValueChange={vi.fn()}
        placeholder="Elige colores…"
        variant="secondary"
        responsive
        className="h-10"
      />,
    );
    const clases = disparador().className;
    expect(clases).toContain("h-10");
    expect(clases).not.toContain("h-auto");
  });
});
