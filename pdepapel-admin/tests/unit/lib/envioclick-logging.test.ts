import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { captureLogs, fixtureCustomer, personalValues } from "@/tests/helpers/log-capture";

vi.mock("@/lib/env.mjs", () => ({
  env: { ENVIOCLICK_API_KEY: "test-key", ENVIOCLICK_API_URL: "https://envioclick.test", NODE_ENV: "production" },
}));

import { isInsufficientCreditError } from "@/lib/envioclick-credit-alert";
import { envioClickClient } from "@/lib/envioclick";

/**
 * Incidente 2026-11-03: «[EnvioClick] Shipment creation failed» escribió el destinatario completo
 * (requestParams) y el registro previo a cada guía lo hacía siempre.
 */
const c = fixtureCustomer();
const party = { company: "NA", firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, address: c.address, suburb: "NA", crossStreet: "NA", reference: "NA" };
const params = {
  idRate: 26689253,
  myShipmentReference: "ORD-1",
  requestPickup: true,
  pickupDate: "2026-11-02",
  insurance: false,
  description: "Productos P de Papel",
  contentValue: 27997,
  packages: [{ weight: 1, height: 10, width: 10, length: 10 }],
  origin: { ...party, daneCode: "05001000" },
  destination: { ...party, daneCode: "11001000" },
};

const respond = (body: unknown) => vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));

let logs: ReturnType<typeof captureLogs>;
beforeEach(() => {
  logs = captureLogs();
});
afterEach(() => {
  logs.restore();
  vi.unstubAllGlobals();
});

const expectNoPersonalData = (text: string) => {
  for (const value of personalValues(c)) expect(text).not.toContain(value);
};

describe("EnvioClick: los registros no llevan datos de la clienta", () => {
  it("sin saldo: el registro y el error no traen el destinatario, y el error se reconoce para avisar a la dueña", async () => {
    vi.stubGlobal(
      "fetch",
      respond({
        status: "NOT OK",
        status_codes: [422],
        status_messages: [
          { error: ["Unprocessed Entity.", "No tiene suficiente crédito disponible en su cuenta. Necesita hacer un depósito en www.envioclickpro.com.co"] },
          { request: `destination ${c.email} ${c.phone} ${c.address}` },
        ],
        data: { destination: params.destination },
      }),
    );
    const thrown = await envioClickClient.createShipment(params as never).catch((error: unknown) => error);
    expect(thrown).toBeInstanceOf(Error);
    expect(isInsufficientCreditError(thrown)).toBe(true);
    expect((thrown as { code?: string }).code).toBe("ENVIOCLICK_API_ERROR");
    expect(Object.keys(thrown as object)).not.toContain("originalError");
    expectNoPersonalData(String((thrown as Error).message));
    expect(logs.text()).toContain("[EnvioClick] Shipment creation failed");
    expect(logs.text()).toContain("26689253");
    expectNoPersonalData(logs.text());
  });

  it("guía creada: ni la petición ni la respuesta (que repite origen, destino y el PDF) llegan al registro", async () => {
    vi.stubGlobal(
      "fetch",
      respond({ status: "OK", data: { idOrder: 77, tracker: "GUIA77", origin: params.origin, destination: params.destination, guide: "JVBERi0x" } }),
    );
    const result = await envioClickClient.createShipment(params as never);
    expect(result.data.idOrder).toBe(77);
    expect(logs.text()).toContain("GUIA77");
    expect(logs.text()).not.toContain("JVBERi0x");
    expectNoPersonalData(logs.text());
  });
});
