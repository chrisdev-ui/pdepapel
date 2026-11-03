import { describe, expect, it } from "vitest";

import { fixtureCustomer } from "@/tests/helpers/log-capture";
import {
  prismaLogMessage,
  redactLogText,
  safeError,
  shipmentLogSummary,
  summarizePrismaValidationMessage,
} from "@/lib/log-redaction";

const c = fixtureCustomer();

describe("redactLogText: sin datos de clientas en los registros", () => {
  it("quita correo, celular (con y sin +57), dirección y documento", () => {
    const text = `Error con ${c.email}, tel ${c.phoneIntl} / ${c.phone}, dir ${c.address}, cédula ${c.document}`;
    const clean = redactLogText(text);
    for (const value of [c.email, c.phone, "Carrera 77", c.document]) expect(clean).not.toContain(value);
    expect(clean).toContain("[correo]");
    expect(clean).toContain("[número]");
    expect(clean).toContain("[dirección]");
    expect(clean).toContain("[documento]");
  });

  it("deja intactas las referencias, ids, fechas y montos que sirven para depurar", () => {
    const text = "pedido ORD-1793673348281-170 idRate 26689253 dane 05001000 2026-11-03T07:55:11.317Z total 27997";
    expect(redactLogText(text)).toBe(text);
  });

  it("acorta el texto largo", () => {
    expect(redactLogText("x".repeat(900), 100)).toHaveLength(100);
  });
});

describe("safeError", () => {
  it("nunca incluye propiedades del error: ni la petición ni el error original", () => {
    const error = Object.assign(new Error(`falló para ${c.email}`), {
      code: "ENVIOCLICK_API_ERROR",
      requestParams: { destination: { email: c.email, address: c.address } },
      originalError: new Error(c.address),
      response: { status: 422, data: { destination: { phone: c.phone } } },
    });
    const safe = safeError(error);
    expect(safe).toMatchObject({ name: "Error", code: "ENVIOCLICK_API_ERROR", status: 422 });
    expect(JSON.stringify(safe)).not.toMatch(new RegExp([c.email, c.phone, "Carrera 77"].map((v) => v.replace(/[.+]/g, "\\$&")).join("|")));
    expect(Object.keys(safe).sort()).toEqual(["at", "code", "message", "name", "status"]);
  });

  it("un error de validación de Prisma queda en su primera línea y el motivo", () => {
    const message = [
      "",
      "Invalid `prisma.order.create()` invocation:",
      "",
      "{",
      `  data: { fullName: "${c.firstName} ${c.lastName}", email: "${c.email}", address: "${c.address}", nope: 1 }`,
      "}",
      "",
      "Unknown argument `nope`. Available options are marked with ?.",
    ].join("\n");
    const error = Object.assign(new Error(message), { name: "PrismaClientValidationError" });
    const safe = safeError(error);
    expect(safe.message).toBe("Invalid `prisma.order.create()` invocation: … Unknown argument `nope`. Available options are marked with ?.");
    expect(summarizePrismaValidationMessage(message)).toBe(safe.message);
    expect(prismaLogMessage(message)).toBe(safe.message);
  });

  it("acepta lo que no es un Error", () => {
    expect(safeError(`texto ${c.email}`)).toEqual({ name: "string", message: "texto [correo]" });
  });
});

describe("shipmentLogSummary", () => {
  it("solo tarifa, paquetes y municipios; nada del remitente ni del destinatario", () => {
    const summary = shipmentLogSummary({
      idRate: 26689253,
      packages: [{ weight: 1 }, { weight: "0.5" }],
      origin: { daneCode: "05001000", email: c.email } as never,
      destination: { daneCode: "11001000", phone: c.phone, address: c.address } as never,
      contentValue: 27997,
      requestPickup: true,
    });
    expect(summary).toEqual({
      idRate: 26689253,
      packages: 2,
      weight: 1.5,
      originDane: "05001000",
      destinationDane: "11001000",
      isCOD: false,
      contentValue: 27997,
      requestPickup: true,
    });
  });
});
