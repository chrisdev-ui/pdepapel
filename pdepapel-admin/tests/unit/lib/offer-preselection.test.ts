import { describe, expect, it } from "vitest";

import {
  OFFER_PRESELECTION_LIMIT,
  buildOfferPreselectionHref,
  parsePreselectedProductIds,
} from "@/lib/offer-preselection";

const uuid = (n: number) =>
  `0000000${String(n).padStart(4, "0")}-1111-4222-8333-444444444444`;

describe("parsePreselectedProductIds", () => {
  it("lee una lista separada por comas", () => {
    expect(parsePreselectedProductIds(`${uuid(1)},${uuid(2)}`)).toEqual([
      uuid(1),
      uuid(2),
    ]);
  });

  it("no devuelve nada cuando el parámetro no viene o está vacío", () => {
    expect(parsePreselectedProductIds(undefined)).toEqual([]);
    expect(parsePreselectedProductIds("")).toEqual([]);
    expect(parsePreselectedProductIds(",,,")).toEqual([]);
  });

  it("se queda con el primer valor si el parámetro llega repetido", () => {
    expect(parsePreselectedProductIds([uuid(1), uuid(2)])).toEqual([uuid(1)]);
  });

  it("quita espacios y repetidos, conservando el orden de llegada", () => {
    expect(
      parsePreselectedProductIds(` ${uuid(2)} , ${uuid(1)}, ${uuid(2)} `),
    ).toEqual([uuid(2), uuid(1)]);
  });

  it("descarta lo que no tiene forma de id", () => {
    // Nada de esto puede ser un id de producto, y no tiene por qué llegar a
    // una consulta solo porque alguien lo escribió en la dirección.
    const basura = [
      "corto",
      "con espacio",
      "../../etc/passwd",
      "<script>",
      "'; DROP TABLE Product; --",
      "x".repeat(65),
    ].join(",");
    expect(parsePreselectedProductIds(`${basura},${uuid(1)}`)).toEqual([
      uuid(1),
    ]);
  });

  it("nunca devuelve más del tope, aunque la dirección traiga cientos", () => {
    const muchos = Array.from({ length: 500 }, (_, i) => uuid(i)).join(",");
    expect(parsePreselectedProductIds(muchos)).toHaveLength(
      OFFER_PRESELECTION_LIMIT,
    );
  });
});

describe("buildOfferPreselectionHref", () => {
  it("arma el enlace con los ids elegidos", () => {
    expect(buildOfferPreselectionHref("tienda-1", [uuid(1), uuid(2)])).toBe(
      `/tienda-1/ofertas/nuevo?productos=${uuid(1)},${uuid(2)}`,
    );
  });

  it("sin productos, lleva al formulario vacío de siempre", () => {
    expect(buildOfferPreselectionHref("tienda-1", [])).toBe(
      "/tienda-1/ofertas/nuevo",
    );
  });

  it("recorta al tope y deja la dirección muy por debajo del límite del navegador", () => {
    const href = buildOfferPreselectionHref(
      "0f8fad5b-d9cb-469f-a165-70867728950e",
      Array.from({ length: 100 }, (_, i) => uuid(i)),
    );
    expect(href.split(",")).toHaveLength(OFFER_PRESELECTION_LIMIT);
    expect(href.length).toBeLessThan(900);
  });

  it("lo que arma el enlace es exactamente lo que la página vuelve a leer", () => {
    const ids = Array.from({ length: 50 }, (_, i) => uuid(i));
    const href = buildOfferPreselectionHref("tienda-1", ids);
    const query = href.split("?productos=")[1];
    expect(parsePreselectedProductIds(query)).toEqual(
      ids.slice(0, OFFER_PRESELECTION_LIMIT),
    );
  });
});
