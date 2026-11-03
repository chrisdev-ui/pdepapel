import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handleErrorResponse } from "@/lib/api-errors";
import { logPrismaErrorEvent } from "@/lib/log-redaction";
import { captureLogs, fixtureCustomer, personalValues } from "@/tests/helpers/log-capture";

/**
 * Un PrismaClientValidationError copia en el mensaje los argumentos de la consulta con sus valores.
 * handleErrorResponse lo registraba entero y lo devolvía en la respuesta; Prisma también lo emite en su
 * canal `error` (probado contra MySQL el 2026-11-03).
 */
const c = fixtureCustomer();
const validationMessage = [
  "",
  "Invalid `prisma.order.create()` invocation in",
  "/var/task/pdepapel-admin/.next/server/app/api/[storeId]/checkout/route.js:1:8233",
  "",
  "{",
  "  data: {",
  `    fullName: "${c.firstName} ${c.lastName}",`,
  `    email: "${c.email}",`,
  `    phone: "${c.phoneIntl}",`,
  `    address: "${c.address}",`,
  `    documentId: "${c.document}",`,
  "    nope: 1",
  "  }",
  "}",
  "",
  "Unknown argument `nope`. Available options are marked with ?.",
].join("\n");

let logs: ReturnType<typeof captureLogs>;
beforeEach(() => {
  logs = captureLogs();
});
afterEach(() => logs.restore());

const expectNoPersonalData = (text: string) => {
  for (const value of personalValues(c)) expect(text).not.toContain(value);
};

describe("handleErrorResponse: sin datos de la clienta", () => {
  it("un error de validación de Prisma se registra y se responde solo con el motivo", async () => {
    const error = new Prisma.PrismaClientValidationError(validationMessage, { clientVersion: "6.0.0" });
    const response = handleErrorResponse(error, "ORDER_CHECKOUT");
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.details.message).toContain("Unknown argument `nope`");
    expectNoPersonalData(JSON.stringify(body));
    expect(logs.text()).toContain("Error in [ORDER_CHECKOUT]");
    expectNoPersonalData(logs.text());
  });

  it("un error cualquiera con la petición pegada no la escribe en el registro", () => {
    const error = Object.assign(new Error(`falló el envío a ${c.email}`), { requestParams: { destination: { phone: c.phone, address: c.address } } });
    handleErrorResponse(error, "ORDER_SHIPPING_CREATE_GUIDE");
    expect(logs.text()).toContain("[correo]");
    expectNoPersonalData(logs.text());
  });
});

describe("canal `error` de Prisma", () => {
  it("se escribe solo con la primera línea y el motivo", () => {
    logPrismaErrorEvent({ message: validationMessage });
    expect(logs.text()).toContain("prisma:error");
    expect(logs.text()).toContain("Unknown argument `nope`");
    expectNoPersonalData(logs.text());
  });
});
