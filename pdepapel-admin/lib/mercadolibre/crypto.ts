import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { MercadoLibreConfigurationError } from "./config";

const ALGORITHM = "aes-256-gcm";
const INITIALIZATION_VECTOR_LENGTH = 12;
const ENCRYPTION_VERSION = "v1";

function getEncryptionKey(encodedKey: string) {
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) {
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

  const initializationVector = randomBytes(INITIALIZATION_VECTOR_LENGTH);
  const cipher = createCipheriv(
    ALGORITHM,
    getEncryptionKey(encodedKey),
    initializationVector,
  );
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const authenticationTag = cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    initializationVector.toString("base64url"),
    authenticationTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptMercadoLibreToken(
  encryptedToken: string,
  encodedKey: string,
) {
  const [version, initializationVector, authenticationTag, ciphertext] =
    encryptedToken.split(".");
  if (
    version !== ENCRYPTION_VERSION ||
    !initializationVector ||
    !authenticationTag ||
    !ciphertext
  ) {
    throw new Error("El formato del token cifrado no es válido");
  }

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      getEncryptionKey(encodedKey),
      Buffer.from(initializationVector, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(authenticationTag, "base64url"));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof MercadoLibreConfigurationError) throw error;
    throw new Error("No fue posible descifrar el token de Mercado Libre");
  }
}
