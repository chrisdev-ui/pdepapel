import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getStoreSender, STORE_SENDER_ENV } from "@/lib/store-sender";

const FAKE_SENDER = {
  STORE_SENDER_FIRST_NAME: "Remitente",
  STORE_SENDER_LAST_NAME: "De Prueba",
  STORE_SENDER_EMAIL: "envios@ejemplo.test",
  STORE_SENDER_PHONE: "3000000000",
  STORE_SENDER_ADDRESS: "Calle 123 # 45-67, Apto 101",
};
const KEYS = [
  ...Object.values(STORE_SENDER_ENV),
  "STORE_SENDER_SUBURB",
  "STORE_SENDER_CROSS_STREET",
  "STORE_SENDER_REFERENCE",
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.restoreAllMocks();
});

describe("getStoreSender", () => {
  it("arma el remitente con las variables de entorno y el origen fijo de la tienda", () => {
    Object.assign(process.env, FAKE_SENDER, { STORE_SENDER_REFERENCE: "Portería" });

    expect(getStoreSender()).toMatchObject({
      firstName: "Remitente",
      lastName: "De Prueba",
      email: "envios@ejemplo.test",
      phone: "3000000000",
      address: "Calle 123 # 45-67, Apto 101",
      suburb: null,
      crossStreet: null,
      reference: "Portería",
      daneCode: expect.any(String),
      company: expect.any(String),
    });
  });

  it("recorta espacios y trata un valor vacío como faltante", () => {
    Object.assign(process.env, FAKE_SENDER, { STORE_SENDER_PHONE: "   ", STORE_SENDER_ADDRESS: "  Calle 1  " });

    expect(() => getStoreSender()).toThrow(/STORE_SENDER_PHONE/);
    process.env.STORE_SENDER_PHONE = "3000000000";
    expect(getStoreSender().address).toBe("Calle 1");
  });

  it("nombra las variables que faltan sin mostrar ningún valor", () => {
    Object.assign(process.env, FAKE_SENDER);
    delete process.env.STORE_SENDER_EMAIL;
    delete process.env.STORE_SENDER_ADDRESS;

    let message = "";
    try {
      getStoreSender();
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/STORE_SENDER_EMAIL/);
    expect(message).toMatch(/STORE_SENDER_ADDRESS/);
    expect(message).not.toMatch(/STORE_SENDER_PHONE/);
    for (const value of Object.values(FAKE_SENDER)) expect(message).not.toContain(value);
  });
});
