import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifrado de tokens de terceros en la base: AES-256-GCM con el formato
 * `v1.<iv>.<tag>.<cifrado>` (base64url). Cada integración trae su propia llave
 * de 32 bytes en Base64, para que rotar una no deje ilegibles las demás.
 */
const ALGORITHM = "aes-256-gcm";
const INITIALIZATION_VECTOR_LENGTH = 12;
const ENCRYPTION_VERSION = "v1";

export class TokenDecryptionError extends Error {}

/** La llave decodificada, o null si no es Base64 de 32 bytes. */
export function decodeTokenKey(encodedKey: string | undefined | null): Buffer | null {
  if (!encodedKey) return null;
  const key = Buffer.from(encodedKey, "base64");
  return key.length === 32 ? key : null;
}

export function encryptToken(token: string, key: Buffer) {
  if (!token) {
    throw new Error("No es posible cifrar un token vacío");
  }
  const initializationVector = randomBytes(INITIALIZATION_VECTOR_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, initializationVector);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [
    ENCRYPTION_VERSION,
    initializationVector.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptToken(encryptedToken: string, key: Buffer) {
  const [version, initializationVector, authenticationTag, ciphertext] = encryptedToken.split(".");
  if (version !== ENCRYPTION_VERSION || !initializationVector || !authenticationTag || !ciphertext) {
    throw new Error("El formato del token cifrado no es válido");
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(initializationVector, "base64url"));
    decipher.setAuthTag(Buffer.from(authenticationTag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new TokenDecryptionError("No fue posible descifrar el token");
  }
}
