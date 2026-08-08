import { describe, expect, it } from "vitest";

import {
  decryptMercadoLibreToken,
  encryptMercadoLibreToken,
} from "@/lib/mercadolibre/crypto";

const key = Buffer.alloc(32, 7).toString("base64");

describe("Mercado Libre token encryption", () => {
  it("encrypts tokens with a random initialization vector and decrypts them", () => {
    const token = "APP_USR-very-sensitive-token";
    const firstEncrypted = encryptMercadoLibreToken(token, key);
    const secondEncrypted = encryptMercadoLibreToken(token, key);

    expect(firstEncrypted).not.toBe(token);
    expect(secondEncrypted).not.toBe(firstEncrypted);
    expect(decryptMercadoLibreToken(firstEncrypted, key)).toBe(token);
  });

  it("rejects a malformed encryption key", () => {
    expect(() => encryptMercadoLibreToken("token", "not-a-valid-key")).toThrow(
      "MERCADOLIBRE_TOKEN_ENCRYPTION_KEY",
    );
  });
});
