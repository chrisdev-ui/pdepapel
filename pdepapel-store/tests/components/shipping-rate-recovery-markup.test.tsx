/* @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ShippingRateRecovery,
  type RecoveryRate,
} from "@/app/(routes)/finalizar-compra/components/steps/shipping-rate-recovery";

/**
 * HTML que el navegador NO acepta anidado, aunque JSX lo deje escribir.
 *
 * Por qué importa: `<p>` y `<span>` solo admiten contenido en línea. Meter un
 * `<div>` dentro rompe la hidratación de React, y cuando eso pasa React deja de
 * enganchar los eventos de esa parte del árbol: los botones quedan pintados
 * pero muertos. En jsdom no se nota —solo aparece al hidratar HTML del
 * servidor en un navegador de verdad—, así que se comprueba sobre el marcado.
 *
 * Esto ya pasó: `Currency` pinta un `<div>` y estaba dentro de un `<span>`.
 */
const BLOQUE = new Set(["div", "p", "ul", "ol", "li", "h1", "h2", "h3", "section"]);
const EN_LINEA = new Set(["p", "span"]);

/**
 * Se revisa el MARCADO tal como lo emite React, no el DOM ya parseado: el
 * parser del navegador «arregla» `<p><div>` cerrando el párrafo antes, así que
 * mirando el DOM el fallo desaparece. Lo que rompe la hidratación es
 * justamente esa diferencia entre lo que se emite y lo que el navegador monta.
 */
function anidamientosInvalidos(html: string): string[] {
  const fallos: string[] = [];
  const pila: string[] = [];
  const etiquetas = Array.from(
    html.matchAll(/<(\/?)([a-z][a-z0-9]*)\b[^>]*?(\/?)>/gi),
  );

  for (const [, cierre, nombreCrudo, autocierre] of etiquetas) {
    const nombre = nombreCrudo.toLowerCase();
    if (cierre) {
      const i = pila.lastIndexOf(nombre);
      if (i !== -1) pila.length = i;
      continue;
    }
    if (autocierre || ["br", "img", "input", "hr"].includes(nombre)) continue;

    const contenedor = [...pila].reverse().find((t) => EN_LINEA.has(t));
    if (contenedor && BLOQUE.has(nombre)) {
      fallos.push(`<${nombre}> dentro de <${contenedor}>`);
    }
    pila.push(nombre);
  }
  return fallos;
}

const tarifa = (over: Partial<RecoveryRate> = {}): RecoveryRate => ({
  idRate: 26341752,
  carrier: "ENVIA",
  product: "Normal",
  flete: 19500,
  minimumInsurance: 0,
  totalCost: 19500,
  deliveryDays: 2,
  isCOD: false,
  ...over,
});

const pintar = (recovery: React.ComponentProps<typeof ShippingRateRecovery>["recovery"]) =>
  renderToStaticMarkup(
    <ShippingRateRecovery
      recovery={recovery}
      onConfirm={() => undefined}
      onChooseAnother={() => undefined}
      isSubmitting={false}
    />,
  );

describe("el marcado de la tarjeta es válido para el navegador", () => {
  it("el detector caza el anidamiento malo (si no, no probaría nada)", () => {
    expect(anidamientosInvalidos("<p>hola <div>malo</div></p>")).toHaveLength(1);
    expect(anidamientosInvalidos("<span><div>malo</div></span>")).toHaveLength(1);
    expect(anidamientosInvalidos("<p>bien <span>bien</span></p>")).toEqual([]);
  });

  it("precio cambiado: ningún bloque dentro de <p> ni de <span>", () => {
    const html = pintar({ kind: "changed", rate: tarifa(), previousCost: 13997 });
    expect(anidamientosInvalidos(html)).toEqual([]);
    // Y los dos precios siguen ahí, para que no se “arregle” quitándolos.
    expect(html).toContain("19.500");
    expect(html).toContain("13.997");
  });

  it("sin precio anterior: sigue siendo válido", () => {
    const html = pintar({ kind: "changed", rate: tarifa(), previousCost: 0 });
    expect(anidamientosInvalidos(html)).toEqual([]);
  });

  it("sin cobertura: la lista de alternativas también es válida", () => {
    const html = pintar({
      kind: "unavailable",
      alternatives: [tarifa({ idRate: 1, carrier: "TCC", totalCost: 15000 })],
    });
    expect(anidamientosInvalidos(html)).toEqual([]);
    expect(html).toContain("15.000");
  });

  it("sin alternativas: también", () => {
    expect(anidamientosInvalidos(pintar({ kind: "unavailable", alternatives: [] }))).toEqual([]);
  });

  it("un <button> no puede llevar otro botón dentro", () => {
    // Las alternativas son botones; si alguien mete un Button dentro, el clic
    // deja de comportarse como se espera.
    const html = pintar({
      kind: "unavailable",
      alternatives: [tarifa({ idRate: 1, carrier: "TCC" })],
    });
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const boton of Array.from(doc.querySelectorAll("button"))) {
      expect(boton.querySelectorAll("button")).toHaveLength(0);
    }
  });
});
