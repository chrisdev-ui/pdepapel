import { decodeTokenKey, decryptToken, encryptToken, TokenDecryptionError } from "@/lib/token-crypto";

import { MercadoLibreConfigurationError } from "./config";

function getEncryptionKey(encodedKey: string) {
  const key = decodeTokenKey(encodedKey);
  if (!key) {
    throw new MercadoLibreConfigurationError(
      "MERCADOLIBRE_TOKEN_ENCRYPTION_KEY debe ser una clave Base64 de 32 bytes",
    );
  }

  return key;
}

export function encryptMercadoLibreToken(token: string, encodedKey: string) {
  if (!token) {
    throw new Error("No es posible cifrar un token vacío");
  }

  return encryptToken(token, getEncryptionKey(encodedKey));
}

export function decryptMercadoLibreToken(
  encryptedToken: string,
  encodedKey: string,
) {
  try {
    return decryptToken(encryptedToken, getEncryptionKey(encodedKey));
  } catch (error) {
    if (error instanceof TokenDecryptionError) {
      throw new Error("No fue posible descifrar el token de Mercado Libre");
    }
    throw error;
  }
}
