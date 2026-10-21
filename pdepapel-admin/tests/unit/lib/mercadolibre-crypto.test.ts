import { describe, expect, it } from "vitest";

import {
  decryptMercadoLibreToken,
  encryptMercadoLibreToken,
} from "@/lib/mercadolibre/crypto";
import { decodeTokenKey, decryptToken, encryptToken, TokenDecryptionError } from "@/lib/token-crypto";

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

describe("cifrado compartido (lib/token-crypto)", () => {
  // Cifrado con la versión anterior a la extracción: los tokens guardados siguen legibles.
  const STORED = "v1.3ChDAsdaD3CdnclL.EH8jNuXIg88jVctulzLtBQ.-c6ytMCLMWx6n5UPOWXWRpbPDl2n84yPqg";

  it("Mercado Libre descifra un token guardado antes de la extracción", () => {
    expect(decryptMercadoLibreToken(STORED, key)).toBe("APP_USR-fixture-token-123");
  });

  it("el módulo compartido lee el mismo formato y una llave ajena no lo abre", () => {
    expect(decryptToken(STORED, decodeTokenKey(key)!)).toBe("APP_USR-fixture-token-123");
    expect(() => decryptMercadoLibreToken(STORED, Buffer.alloc(32, 8).toString("base64"))).toThrow("No fue posible descifrar el token de Mercado Libre");
    expect(() => decryptToken(STORED, Buffer.alloc(32, 8))).toThrow(TokenDecryptionError);
  });

  it("solo acepta llaves Base64 de 32 bytes", () => {
    expect(decodeTokenKey(undefined)).toBeNull();
    expect(decodeTokenKey("corta")).toBeNull();
    expect(decodeTokenKey(Buffer.alloc(32, 1).toString("base64"))).toHaveLength(32);
  });

  it("un token cifrado nuevo vuelve a abrirse", () => {
    const k = Buffer.alloc(32, 3);
    const sealed = encryptToken("act.tiktok-token", k);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(decryptToken(sealed, k)).toBe("act.tiktok-token");
  });
});
