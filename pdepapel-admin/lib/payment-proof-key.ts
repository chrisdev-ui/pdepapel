/**
 * Comprobantes de pago: la forma de la clave que guarda `PaymentDetails.proofKey`.
 *
 * Un comprobante de transferencia es una captura del banco de la clienta:
 * trae su nombre, su banco, parte de su cuenta y el monto. Por eso no vive
 * con las fotos de producto (Cloudinary, entrega pública) sino en un bucket
 * privado de Cloudflare R2 sin acceso público: lo que se guarda en la base
 * es solo la clave del objeto, que sin las credenciales del servidor no
 * lleva a ninguna parte. El panel lo sirve por una ruta con sesión que lee
 * el objeto y transmite los bytes (lib/payment-proofs.ts).
 *
 * Este módulo es puro (sin SDK ni env) para que la validación de la venta y
 * las pruebas no dependan de credenciales. La clave canónica es:
 *
 *   comprobantes/<storeId>/<uuid>.<jpg|png|webp>
 *
 * Cualquier otra forma —otra carpeta, otra tienda, otra extensión, un nombre
 * que no sea un UUID— se rechaza.
 */

export const PAYMENT_PROOF_PREFIX = "comprobantes";

/** Solo imágenes: es una foto o una captura de pantalla, nunca un PDF ni un archivo. */
export const PAYMENT_PROOF_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type PaymentProofMimeType = (typeof PAYMENT_PROOF_MIME_TYPES)[number];

const EXTENSION_BY_MIME: Record<PaymentProofMimeType, PaymentProofFormat> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type PaymentProofFormat = "jpg" | "png" | "webp";

/**
 * 4 MB: una captura de banco pesa entre 100 KB y 1 MB; una foto de celular
 * sin reducir puede pasar de 5. El tope queda por debajo del límite de 4,5 MB
 * del cuerpo de una función de Vercel, que si no respondería con un 413
 * genérico en vez de con este mensaje.
 */
export const PAYMENT_PROOF_MAX_BYTES = 4 * 1024 * 1024;

export const PAYMENT_PROOF_MAX_BYTES_LABEL = "4 MB";

const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY =
  /^comprobantes\/([A-Za-z0-9_-]+)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|webp)$/;

export interface PaymentProofRef {
  storeId: string;
  /** UUID del objeto, sin extensión. */
  id: string;
  format: PaymentProofFormat;
}

export function isPaymentProofMimeType(
  value: string,
): value is PaymentProofMimeType {
  return (PAYMENT_PROOF_MIME_TYPES as readonly string[]).includes(value);
}

/** Extensión canónica de un tipo aceptado. */
export function paymentProofExtension(
  mimeType: PaymentProofMimeType,
): PaymentProofFormat {
  return EXTENSION_BY_MIME[mimeType];
}

/** Tipo MIME con el que se sirve una clave (el bucket puede no recordarlo). */
export function paymentProofContentType(format: PaymentProofFormat): string {
  return format === "jpg" ? "image/jpeg" : `image/${format}`;
}

/** La clave canónica de un comprobante. Lanza si algún segmento no es seguro. */
export function buildPaymentProofKey({
  storeId,
  id,
  format,
}: PaymentProofRef): string {
  if (!SAFE_SEGMENT.test(storeId)) {
    throw new Error("Identificador de tienda inválido para la clave del comprobante");
  }
  if (!UUID.test(id)) {
    throw new Error("Identificador de comprobante inválido");
  }
  return `${PAYMENT_PROOF_PREFIX}/${storeId}/${id}.${format}`;
}

/**
 * Descompone una clave guardada. Devuelve `null` para todo lo que no sea la
 * forma canónica exacta: así una clave de otra carpeta, de otra tienda o con
 * un nombre inventado nunca se acepta como comprobante.
 */
export function parsePaymentProofKey(key: string): PaymentProofRef | null {
  const match = key.match(KEY);
  if (!match) return null;
  const [, storeId, id, format] = match;
  return { storeId, id, format: format as PaymentProofFormat };
}

/** ¿Es un comprobante válido y de ESTA tienda? Lo que exige la venta antes de guardarlo. */
export function isPaymentProofForStore(key: string, storeId: string): boolean {
  const ref = parsePaymentProofKey(key);
  return ref !== null && ref.storeId === storeId;
}
