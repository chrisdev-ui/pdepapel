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
  BANCOLOMBIA_QR_URL,
  buildPaymentMenuRows,
  buildTransferMenuRows,
  parsePaymentOption,
  renderPaymentOption,
} from "@/lib/whatsapp/bot-facts";
import { readPaymentTarget } from "@/lib/whatsapp/bot-replies";

/**
 * Cuentas INVENTADAS a propósito.
 *
 * Las de verdad viven en la base de datos y no en este repositorio, que es
 * público. Lo que se prueba aquí es el envoltorio —que el dato guardado salga
 * TAL CUAL, sin tocar un dígito—, y para eso sirve igual una cuenta falsa.
 */
const PAGOS_DE_MENTIRA = {
  paymentCashInfo: "Con gusto, trae el valor exacto si puedes.",
  paymentBancolombiaAccount: "Cuenta de Ahorros #00000000000",
  paymentNequiNumber: "3000000000",
  paymentDaviplataNumber: "3000000001",
  paymentCardInfo: "Recibimos todas las tarjetas.",
};

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
  ...PAGOS_DE_MENTIRA,
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
    expect(renderBusinessFact("business.city", completa)).toBe(
      "Estamos en Medellín 💛 y hacemos envíos a toda Colombia.",
    );
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

describe("cómo se paga", () => {
  const preguntas = [
    "métodos de pago?", "cuáles son los medios de pago", "formas de pago",
    "cómo pago?", "cómo puedo pagar", "cómo te pago", "cómo hago el pago",
    "dónde pago", "me pasas el número de cuenta", "tienen cuenta bancaria",
    "a qué cuenta transfiero?", "tienen nequi?", "manejan daviplata",
    "aceptan transferencia", "puedo transferir a bancolombia?", "cómo se paga",
    "dónde consigno", "me das los datos bancarios",
  ];

  it.each(preguntas)("«%s» pregunta por las formas de pago", (q) => {
    expect(classifyBusinessFact(q)).toBe("payment.methods");
  });

  // El desempate es por coincidencia MÁS LARGA, igual que «envío gratis» con
  // «cuánto vale el envío»: una frase de pago no puede robarle el turno a otra
  // intención, ni al revés.
  it.each([
    ["¿a qué hora abren?", "business.hours"],
    ["¿en qué ciudad están?", "business.city"],
    ["¿tienen tienda física?", "business.physical_store"],
    ["¿hay pedido mínimo?", "business.min_order"],
    ["¿desde cuánto es el envío gratis?", "shipping.free_threshold"],
    ["¿cuánto se demora en llegar?", "shipping.delivery_days"],
  ])("«%s» sigue siendo %s", (q, intent) => {
    expect(classifyBusinessFact(q)).toBe(intent);
  });

  it("no se activa con un «pago» que no pregunta por esto", () => {
    expect(classifyBusinessFact("ya hice el pago, cuándo llega?")).toBe(
      "shipping.delivery_days",
    );
    expect(classifyBusinessFact("gracias!")).toBeNull();
  });

  it("sin ninguna forma llena, no hay menú y la pregunta pasa a Paula", () => {
    const sinNada = {
      ...completa,
      paymentCashInfo: null, paymentCardInfo: null,
      paymentBancolombiaAccount: null, paymentNequiNumber: null,
      paymentDaviplataNumber: null,
    };
    expect(buildPaymentMenuRows(sinNada)).toEqual([]);
    expect(renderBusinessFact("payment.methods", sinNada)).toBeNull();
  });

  it("el menú de arriba son tres opciones tocables", () => {
    const filas = buildPaymentMenuRows(completa);
    expect(filas.map((f) => f.title)).toEqual(["Efectivo", "Transferencia", "Datáfono"]);
    expect(filas.map((f) => readPaymentTarget(f.id))).toEqual([
      "efectivo", "transferencia", "datafono",
    ]);
  });

  it("una forma sin llenar ni se ofrece", () => {
    const filas = buildPaymentMenuRows({ ...completa, paymentCardInfo: null });
    expect(filas.map((f) => f.title)).toEqual(["Efectivo", "Transferencia"]);
  });

  it("«Transferencia» solo aparece si hay alguna cuenta detrás", () => {
    const sinCuentas = {
      ...completa,
      paymentBancolombiaAccount: null, paymentNequiNumber: null,
      paymentDaviplataNumber: null,
    };
    expect(buildPaymentMenuRows(sinCuentas).map((f) => f.title)).toEqual([
      "Efectivo", "Datáfono",
    ]);
  });

  it("el segundo menú son las tres cuentas", () => {
    // El mismo orden en que Paula las manda hoy a mano.
    expect(buildTransferMenuRows(completa).map((f) => f.title)).toEqual([
      "Bancolombia", "Daviplata", "Nequi",
    ]);
  });

  it("caben de sobra bajo el tope de filas de Meta, con la de Paula incluida", () => {
    // Tres opciones más «Hablar con Paula» son cuatro; de botones solo caben
    // tres, por eso esto va como lista y no como botones.
    expect(buildPaymentMenuRows(completa).length + 1).toBeLessThanOrEqual(10);
    expect(buildTransferMenuRows(completa).length + 1).toBeLessThanOrEqual(10);
  });

  it("efectivo y datáfono contestan con lo guardado, tal cual", () => {
    expect(renderPaymentOption("efectivo", completa)?.text).toContain(
      PAGOS_DE_MENTIRA.paymentCashInfo,
    );
    expect(renderPaymentOption("datafono", completa)?.text).toContain(
      PAGOS_DE_MENTIRA.paymentCardInfo,
    );
  });

  it("Bancolombia va con el QR y con la línea del comprobante", () => {
    const hoja = renderPaymentOption("bancolombia", completa)!;
    expect(hoja.photo).toBe(BANCOLOMBIA_QR_URL);
    expect(hoja.text).toContain(PAGOS_DE_MENTIRA.paymentBancolombiaAccount);
    expect(hoja.text).toContain("QR");
    expect(hoja.text).toContain(
      "Cuando realices el pago, me envías el comprobante, por favor 🤗",
    );
  });

  it.each(["nequi", "daviplata"] as const)(
    "%s contesta con su número y el comprobante, sin foto",
    (option) => {
      const hoja = renderPaymentOption(option, completa)!;
      expect(hoja.photo).toBeUndefined();
      expect(hoja.text).toContain(
        "Cuando realices el pago, me envías el comprobante, por favor 🤗",
      );
    },
  );

  it("Nequi y Daviplata no se confunden de número", () => {
    expect(renderPaymentOption("nequi", completa)!.text).toContain(
      PAGOS_DE_MENTIRA.paymentNequiNumber,
    );
    expect(renderPaymentOption("daviplata", completa)!.text).toContain(
      PAGOS_DE_MENTIRA.paymentDaviplataNumber,
    );
  });

  it("«Transferencia» no contesta: abre el segundo menú", () => {
    const hoja = renderPaymentOption("transferencia", completa)!;
    expect(hoja.rows).toHaveLength(3);
    expect(hoja.photo).toBeUndefined();
  });

  it("una opción que se vació entre el menú y el toque devuelve null", () => {
    // Quien llama lo trata como opción caducada y se lo pasa a Paula.
    expect(
      renderPaymentOption("nequi", { ...completa, paymentNequiNumber: null }),
    ).toBeNull();
    // Y no estorba a las demás, que siguen contestando.
    expect(
      renderPaymentOption("bancolombia", { ...completa, paymentNequiNumber: null }),
    ).not.toBeNull();
  });

  it("las respuestas de plata van sin 💛, a propósito", () => {
    for (const option of ["bancolombia", "nequi", "daviplata"] as const) {
      expect(renderPaymentOption(option, completa)!.text).not.toContain("💛");
    }
    // Los menús sí lo llevan: son navegación, no plata.
    expect(renderBusinessFact("payment.methods", completa)).toContain("💛");
  });

  it("ni un dígito de lo guardado se pierde por el camino", () => {
    const hoja = renderPaymentOption("bancolombia", completa)!;
    expect(hoja.text).toContain("#00000000000");
  });

  it.each([
    ["efectivo", "efectivo"], ["bancolombia", "bancolombia"],
    ["inventada", null], ["", null], [null, null],
  ])("parsePaymentOption(%s)", (valor, esperado) => {
    expect(parsePaymentOption(valor as string | null)).toBe(esperado);
  });

  it("Paula puede LEER el recorrido entero antes de aprobarlo", () => {
    const fila = previewBusinessFacts(completa).find(
      (f) => f.intent === "payment.methods",
    );
    expect(fila?.label).toBe("Cómo se paga (menú)");
    const texto = fila!.text!;
    // Las tres de arriba y las tres de detrás de «Transferencia».
    for (const etiqueta of ["Efectivo", "Transferencia", "Datáfono",
                            "Bancolombia", "Nequi", "Daviplata"]) {
      expect(texto).toContain(etiqueta);
    }
    // Con sus datos de verdad, no con ejemplos.
    expect(texto).toContain(PAGOS_DE_MENTIRA.paymentBancolombiaAccount);
    expect(texto).toContain(PAGOS_DE_MENTIRA.paymentNequiNumber);
    // Y avisando de que una lleva foto.
    expect(texto).toContain("QR");
    // La salida a Paula se ve en el menú dibujado.
    expect(texto).toContain("Hablar con Paula");
  });

  it("lo que no está lleno tampoco sale en la vista previa", () => {
    const fila = previewBusinessFacts({ ...completa, paymentCardInfo: null }).find(
      (f) => f.intent === "payment.methods",
    );
    expect(fila!.text).not.toContain("Datáfono");
    expect(fila!.text).toContain("Efectivo");
  });

  it("sin nada llenado, la pantalla lo enseña vacío para que sepa qué llenar", () => {
    const fila = previewBusinessFacts({
      ...completa,
      paymentCashInfo: null, paymentCardInfo: null,
      paymentBancolombiaAccount: null, paymentNequiNumber: null,
      paymentDaviplataNumber: null,
    }).find((f) => f.intent === "payment.methods");
    expect(fila?.text).toBeNull();
  });
});
