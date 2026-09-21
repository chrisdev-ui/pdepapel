import { MinimumOrderRule } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({ env: {} }));

import type { ResolvedStoreSettings } from "@/lib/store-settings";
import {
  BUSINESS_FACT_TEMPLATES,
  BUSINESS_FACT_TEMPLATES_VERSION,
  buildWelcomeMenuRows,
  isWelcomeGreeting,
  renderBusinessFact,
} from "@/lib/whatsapp/bot-facts";
import { buildFactRowId, readFactTarget } from "@/lib/whatsapp/bot-replies";
import {
  WHATSAPP_LIST_MAX_ROWS,
  WHATSAPP_LIST_ROW_DESCRIPTION_MAX_LENGTH,
  WHATSAPP_LIST_ROW_ID_MAX_LENGTH,
  WHATSAPP_LIST_ROW_TITLE_MAX_LENGTH,
  WHATSAPP_LIST_SECTION_TITLE_MAX_LENGTH,
  sendWhatsAppListMessage,
} from "@/lib/whatsapp/send";

/** Los ajustes reales de Paula el 21 de septiembre de 2026. */
const ajustes = {
  alwaysOpen: true,
  openingHours: null,
  cityName: "Medellín",
  hasPhysicalStore: false,
  physicalAddress: null,
  minOrderRule: MinimumOrderRule.MATCH_SHIPPING,
  minOrderAmount: null,
  freeShippingThreshold: null,
  deliveryEstimate: "2 a 4 días hábiles",
  paymentCashInfo: "Con gusto, trae el valor exacto si puedes.",
  paymentBancolombiaAccount: "23600003664",
  paymentNequiNumber: "3142829044",
  paymentDaviplataNumber: "3142829044",
  paymentCardInfo: "Recibimos en el apartamento 1801.",
  botEnabled: true,
  botFactsApprovedAt: new Date(),
  botFactsVersion: BUSINESS_FACT_TEMPLATES_VERSION,
  botProductsApprovedAt: new Date(),
  botProductsVersion: "x",
} as unknown as ResolvedStoreSettings;

describe("reconocer un saludo", () => {
  it("saluda cuando saludan", () => {
    for (const frase of ["Hola", "hola!", "Buenas", "Buenos días", "Buenas tardes", "saludos", "Holi", "hey"]) {
      expect(isWelcomeGreeting(frase), frase).toBe(true);
    }
  });

  it("aguanta la vocal estirada, que es como saluda la gente", () => {
    // «Hoola» sale de una conversación real (8ca4fdac, 21 sep).
    for (const frase of ["Hoola", "Holaa", "holaaa", "buenaas tardes"]) {
      expect(isWelcomeGreeting(frase), frase).toBe(true);
    }
  });

  /**
   * El menú se reconoce con palabras enteras, no con `includes`. Si se usara
   * `includes` —como hace `classifyBusinessFact`— «ola» volvería a colarse
   * dentro de «escolares» y el saludo taparía la pregunta por un producto.
   */
  it("no confunde un producto con un saludo", () => {
    for (const frase of ["¿Tienen útiles escolares?", "¿Tienen bolígrafos?", "¿Venden cola escolar?"]) {
      expect(isWelcomeGreeting(frase), frase).toBe(false);
    }
  });
});

describe("las filas del menú de bienvenida", () => {
  it("salen las cuatro acordadas, en orden", () => {
    const filas = buildWelcomeMenuRows(ajustes);
    expect(filas.map((f) => f.title)).toEqual([
      "Cómo pagar",
      "Envíos y tiempos",
      "Dónde estamos",
      "Horario",
    ]);
    expect(filas.map((f) => f.id)).toEqual([
      "fact:payment.methods",
      "fact:shipping.delivery_days",
      "fact:business.city",
      "fact:business.hours",
    ]);
  });

  it("cada id lleva a la respuesta que de verdad le toca", () => {
    for (const fila of buildWelcomeMenuRows(ajustes)) {
      const intent = readFactTarget(fila.id);
      expect(intent).not.toBeNull();
      const respuesta = renderBusinessFact(intent as never, ajustes);
      expect(respuesta, fila.title).toBeTruthy();
    }
    // Y cada uno a la suya, no todos a la misma.
    expect(renderBusinessFact("business.city", ajustes)).toContain("Medellín");
    expect(renderBusinessFact("shipping.delivery_days", ajustes)).toContain("2 a 4 días hábiles");
    expect(renderBusinessFact("payment.methods", ajustes)).toBe(
      BUSINESS_FACT_TEMPLATES["payment.menu"](),
    );
  });

  it("ida y vuelta del id", () => {
    expect(readFactTarget(buildFactRowId("business.city"))).toBe("business.city");
    expect(readFactTarget("pay:nequi")).toBeNull();
    expect(readFactTarget("p:producto-1")).toBeNull();
    expect(readFactTarget("owner")).toBeNull();
    expect(readFactTarget(null)).toBeNull();
  });

  /** Mismo criterio que el menú de pagos: un campo vacío no se ofrece. */
  it("una fila sin dato detrás no se ofrece", () => {
    const sinEnvio = { ...ajustes, deliveryEstimate: null } as ResolvedStoreSettings;
    expect(buildWelcomeMenuRows(sinEnvio).map((f) => f.title)).toEqual([
      "Cómo pagar",
      "Dónde estamos",
      "Horario",
    ]);
  });

  it("respeta los topes de Meta con sitio de sobra para la fila de Paula", () => {
    const filas = buildWelcomeMenuRows(ajustes);
    // +1 por «Hablar con Paula», que `deliver` añade siempre al final.
    expect(filas.length + 1).toBeLessThanOrEqual(WHATSAPP_LIST_MAX_ROWS);
    for (const fila of filas) {
      expect(fila.title.length, fila.title).toBeLessThanOrEqual(WHATSAPP_LIST_ROW_TITLE_MAX_LENGTH);
      expect(fila.description!.length, fila.title).toBeLessThanOrEqual(
        WHATSAPP_LIST_ROW_DESCRIPTION_MAX_LENGTH,
      );
      expect(fila.id.length, fila.id).toBeLessThanOrEqual(WHATSAPP_LIST_ROW_ID_MAX_LENGTH);
    }
    expect(
      BUSINESS_FACT_TEMPLATES["welcome.section"]().length,
    ).toBeLessThanOrEqual(WHATSAPP_LIST_SECTION_TITLE_MAX_LENGTH);
  });
});

/**
 * No se manda nada de verdad: se intercepta la petición y se mira el JSON que
 * habría salido, que es lo que Meta rechaza o acepta.
 */
describe("el mensaje que se le arma a Meta", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** La configuración va por argumento, no por entorno. */
  const configured = {
    CHAKRA_API_KEY: "chakra-key",
    CHAKRA_PLUGIN_ID: "plugin-123",
    WHATSAPP_PHONE_NUMBER_ID: "621067881095773",
  };

  it("sale una lista bien formada", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ _data: { whatsappMessageId: "wamid.LISTA" } }),
    } as unknown as Response);

    await sendWhatsAppListMessage(
      "573001234567",
      BUSINESS_FACT_TEMPLATES["welcome.body"](),
      {
        button: "Ver opciones",
        section: BUSINESS_FACT_TEMPLATES["welcome.section"](),
        footer: "O escríbeme y te ayudo",
        rows: [
          ...buildWelcomeMenuRows(ajustes),
          { id: "owner", title: "Hablar con Paula" },
        ],
      },
      configured,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(payload.type).toBe("interactive");
    expect(payload.interactive.type).toBe("list");
    expect(payload.interactive.body.text).toContain("Qué gusto que escribas");
    expect(payload.interactive.action.button).toBe("Ver opciones");

    const seccion = payload.interactive.action.sections[0];
    expect(seccion.title).toBe("¿En qué te ayudo?");
    expect(seccion.rows.map((r: { id: string }) => r.id)).toEqual([
      "fact:payment.methods",
      "fact:shipping.delivery_days",
      "fact:business.city",
      "fact:business.hours",
      "owner",
    ]);
    // La salida hacia Paula va de última, siempre.
    expect(seccion.rows.at(-1).title).toBe("Hablar con Paula");
    for (const row of seccion.rows) {
      expect(row.title.length).toBeLessThanOrEqual(WHATSAPP_LIST_ROW_TITLE_MAX_LENGTH);
      if (row.description) {
        expect(row.description.length).toBeLessThanOrEqual(
          WHATSAPP_LIST_ROW_DESCRIPTION_MAX_LENGTH,
        );
      }
    }
  });
});
