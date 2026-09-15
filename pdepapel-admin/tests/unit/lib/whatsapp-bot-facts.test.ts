import { MinimumOrderRule } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ResolvedStoreSettings } from "@/lib/store-settings";
import {
  BUSINESS_FACT_TEMPLATES_VERSION,
  areBusinessFactsApproved,
  classifyBusinessFact,
  previewBusinessFacts,
  renderBusinessFact,
  resolveDeliveryEstimate,
  resolveFreeShippingThreshold,
  resolveHours,
  resolveMinOrder,
  resolvePhysicalStore,
} from "@/lib/whatsapp/bot-facts";

/** Una tienda con todo lleno; cada prueba vacía solo lo que le interesa. */
const completa: ResolvedStoreSettings = {
  alwaysOpen: false,
  openingHours: {
    lun: { abre: "08:00", cierra: "18:00" },
    mar: { abre: "08:00", cierra: "18:00" },
    mie: { abre: "08:00", cierra: "18:00" },
    jue: { abre: "08:00", cierra: "18:00" },
    vie: { abre: "08:00", cierra: "18:00" },
    sab: { abre: "08:00", cierra: "18:00" },
    dom: { abre: "08:00", cierra: "18:00" },
  },
  cityName: "Medellín",
  hasPhysicalStore: false,
  physicalAddress: null,
  minOrderRule: MinimumOrderRule.NONE,
  minOrderAmount: null,
  freeShippingThreshold: 120000,
  deliveryEstimate: "2 a 4 días hábiles",
  botEnabled: true,
  botFactsApprovedAt: new Date("2026-09-15T00:00:00.000Z"),
  botFactsVersion: BUSINESS_FACT_TEMPLATES_VERSION,
  botProductsApprovedAt: null,
  botProductsVersion: null,
};

const con = (cambios: Partial<ResolvedStoreSettings>): ResolvedStoreSettings => ({
  ...completa,
  ...cambios,
});

describe("reconocer la pregunta", () => {
  it.each([
    ["¿Cuál es el horario?", "business.hours"],
    ["hasta que hora atienden hoy", "business.hours"],
    ["¿En qué ciudad están?", "business.city"],
    ["hola, tienen tienda fisica?", "business.physical_store"],
    ["hay pedido minimo?", "business.min_order"],
    ["desde cuanto es gratis el envio", "shipping.free_threshold"],
    ["cuanto se demora en llegar?", "shipping.delivery_days"],
  ])("«%s» → %s", (mensaje, esperado) => {
    expect(classifyBusinessFact(mensaje)).toBe(esperado);
  });

  it("no se inventa una intención cuando la pregunta es otra", () => {
    expect(classifyBusinessFact("quiero un cuaderno rosado")).toBeNull();
    expect(classifyBusinessFact("")).toBeNull();
  });

  it("gana la frase más larga, no la primera de la lista", () => {
    // Las dos hablan de envío; la que decide es la que coincide con más texto.
    expect(classifyBusinessFact("cuanto para envio gratis")).toBe(
      "shipping.free_threshold",
    );
    expect(classifyBusinessFact("cuanto demora el envio")).toBe(
      "shipping.delivery_days",
    );
  });
});

describe("resolver el dato", () => {
  it("con atención a toda hora no mira el horario por día", () => {
    const fact = resolveHours(con({ alwaysOpen: true, openingHours: null }));
    expect(fact).toEqual({ known: true, value: "Todos los días, a toda hora" });
  });

  it("alwaysOpen manda por encima de un horario guardado", () => {
    const fact = resolveHours(con({ alwaysOpen: true }));
    expect(fact.known && fact.value).toBe("Todos los días, a toda hora");
  });

  it("sin horario y sin toda hora, no se sabe", () => {
    expect(resolveHours(con({ openingHours: null }))).toEqual({ known: false });
  });

  it("«no tenemos local» sí es un dato; «sí, pero no sé dónde» no", () => {
    expect(resolvePhysicalStore(con({ hasPhysicalStore: false }))).toEqual({
      known: true,
      value: { has: false, address: null },
    });
    expect(
      resolvePhysicalStore(
        con({ hasPhysicalStore: true, physicalAddress: null }),
      ),
    ).toEqual({ known: false });
  });

  it("un mínimo fijo sin monto no se sabe", () => {
    expect(
      resolveMinOrder(
        con({ minOrderRule: MinimumOrderRule.FIXED, minOrderAmount: null }),
      ),
    ).toEqual({ known: false });
  });

  it("el mínimo «que cubra el envío» necesita el umbral", () => {
    expect(
      resolveMinOrder(
        con({
          minOrderRule: MinimumOrderRule.MATCH_SHIPPING,
          freeShippingThreshold: null,
        }),
      ),
    ).toEqual({ known: false });
  });

  it("un umbral en cero o nulo no se sabe", () => {
    expect(resolveFreeShippingThreshold(con({ freeShippingThreshold: 0 }))).toEqual({ known: false });
    expect(resolveFreeShippingThreshold(con({ freeShippingThreshold: null }))).toEqual({ known: false });
  });

  it("un estimado en blanco no se sabe", () => {
    expect(resolveDeliveryEstimate(con({ deliveryEstimate: "   " }))).toEqual({ known: false });
  });
});

describe("armar la respuesta", () => {
  it("cada intención con el dato puesto", () => {
    expect(renderBusinessFact("business.hours", completa)).toContain("08:00 - 18:00");
    expect(renderBusinessFact("business.city", completa)).toContain("Medellín");
    expect(renderBusinessFact("business.physical_store", completa)).toContain("solo vendemos en línea");
    expect(renderBusinessFact("business.min_order", completa)).toContain("No hay pedido mínimo");
    expect(renderBusinessFact("shipping.free_threshold", completa)).toContain("$120.000");
    expect(renderBusinessFact("shipping.delivery_days", completa)).toContain("2 a 4 días hábiles");
  });

  it("sugiere completar, sin empujar, cuando el mínimo es cubrir el envío", () => {
    const texto = renderBusinessFact(
      "business.min_order",
      con({ minOrderRule: MinimumOrderRule.MATCH_SHIPPING }),
    );
    expect(texto).toContain("te sugiero");
    expect(texto).toContain("$120.000");
  });

  it("con tienda física da la dirección", () => {
    const texto = renderBusinessFact(
      "business.physical_store",
      con({ hasPhysicalStore: true, physicalAddress: "Calle 10 #40-20" }),
    );
    expect(texto).toContain("Calle 10 #40-20");
  });

  it("sin el dato devuelve null y NO inventa nada", () => {
    expect(renderBusinessFact("business.city", con({ cityName: null }))).toBeNull();
    expect(renderBusinessFact("business.hours", con({ openingHours: null }))).toBeNull();
    expect(
      renderBusinessFact("shipping.delivery_days", con({ deliveryEstimate: null })),
    ).toBeNull();
    expect(
      renderBusinessFact("shipping.free_threshold", con({ freeShippingThreshold: null })),
    ).toBeNull();
  });

  it("ningún texto deja un hueco sin reemplazar", () => {
    for (const item of previewBusinessFacts(completa)) {
      expect(item.text).toBeTruthy();
      expect(item.text).not.toContain("undefined");
      expect(item.text).not.toContain("null");
      expect(item.text).not.toContain("NaN");
    }
  });
});

describe("visto bueno", () => {
  it("hace falta la fecha y que la versión sea la de estos textos", () => {
    expect(areBusinessFactsApproved(completa)).toBe(true);
    expect(areBusinessFactsApproved(con({ botFactsApprovedAt: null }))).toBe(false);
    // Editar un texto cambia la versión y retira la aprobación sola.
    expect(areBusinessFactsApproved(con({ botFactsVersion: "otra-version" }))).toBe(false);
    expect(areBusinessFactsApproved(con({ botFactsVersion: null }))).toBe(false);
  });
});
