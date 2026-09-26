import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

import { env } from "@/lib/env.mjs";
import {
  buildPaymentProofKey,
  isPaymentProofMimeType,
  parsePaymentProofKey,
  paymentProofContentType,
  paymentProofExtension,
  PAYMENT_PROOF_MAX_BYTES,
  PAYMENT_PROOF_MAX_BYTES_LABEL,
  type PaymentProofRef,
} from "@/lib/payment-proof-key";

/**
 * Comprobantes de pago en Cloudflare R2, lado servidor.
 *
 * Este es el ÚNICO módulo que habla con el almacenamiento: la ruta de subida,
 * la de borrado y la que sirve la imagen pasan por aquí, y nada más en el
 * panel conoce el bucket ni el SDK.
 *
 * Por qué R2 y no Cloudinary: las fotos de producto se suben desde el
 * navegador con un preset sin firma y se entregan públicas, que es lo que se
 * quiere para un catálogo, y la cuenta ya va por encima de su plan. Un
 * comprobante es lo contrario: nadie con un enlace debe poder verlo. El
 * bucket es privado (sin acceso público ni dominio), se le habla por su API
 * compatible con S3 con credenciales que solo tiene el servidor, y el panel
 * entrega la imagen leyendo el objeto y retransmitiendo los bytes con
 * sesión de dueña: no se generan URLs prefirmadas, así ningún enlace
 * temporal viaja al navegador ni queda en un historial.
 *
 * Las cuatro variables son opcionales a propósito: sin ellas el panel no
 * ofrece adjuntar comprobante (`isPaymentProofStorageConfigured`) y todo lo
 * demás sigue igual; la subida contesta 503 en vez de fallar a medias.
 */

export class PaymentProofValidationError extends Error {}

export class PaymentProofStorageNotConfiguredError extends Error {
  constructor() {
    super("El almacenamiento de comprobantes no está configurado");
  }
}

interface StorageConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

function getStorageConfig(): StorageConfig | null {
  const accountId = env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const bucket = env.CLOUDFLARE_R2_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

/** ¿Hay bucket? Decide si la venta ofrece «Adjuntar comprobante». */
export function isPaymentProofStorageConfigured(): boolean {
  return getStorageConfig() !== null;
}

let client: S3Client | null = null;

function getStorage(): { client: S3Client; bucket: string } {
  const config = getStorageConfig();
  if (!config) throw new PaymentProofStorageNotConfiguredError();
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  return { client, bucket: config.bucket };
}

export interface PaymentProofUpload {
  storeId: string;
  bytes: Buffer;
  mimeType: string;
}

/** Valida tipo y tamaño y sube el archivo. Devuelve la clave del objeto. */
export async function uploadPaymentProof({
  storeId,
  bytes,
  mimeType,
}: PaymentProofUpload): Promise<string> {
  if (!isPaymentProofMimeType(mimeType)) {
    throw new PaymentProofValidationError(
      "El comprobante debe ser una imagen (JPG, PNG o WebP)",
    );
  }
  if (bytes.byteLength === 0) {
    throw new PaymentProofValidationError("El comprobante está vacío");
  }
  if (bytes.byteLength > PAYMENT_PROOF_MAX_BYTES) {
    throw new PaymentProofValidationError(
      `El comprobante pesa más de ${PAYMENT_PROOF_MAX_BYTES_LABEL}. Toma una captura más pequeña`,
    );
  }

  const { client, bucket } = getStorage();
  // UUID aleatorio: la clave no se puede adivinar y dos capturas del mismo
  // celular no se pisan.
  const key = buildPaymentProofKey({
    storeId,
    id: randomUUID(),
    format: paymentProofExtension(mimeType),
  });
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: mimeType,
      ContentLength: bytes.byteLength,
      CacheControl: "private, no-store",
    }),
  );
  return key;
}

/** Un comprobante que pertenece a esta tienda, o `null`. Una clave guardada por otra vía nunca se lee. */
export function resolvePaymentProof(
  key: string,
  storeId: string,
): PaymentProofRef | null {
  const ref = parsePaymentProofKey(key);
  if (!ref || ref.storeId !== storeId) return null;
  return ref;
}

export interface PaymentProofFile {
  body: Uint8Array;
  contentType: string;
}

function isMissingObject(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    e?.name === "NoSuchKey" ||
    e?.name === "NotFound" ||
    e?.$metadata?.httpStatusCode === 404
  );
}

/** Lee los bytes del comprobante para retransmitirlos con sesión. `null` si no existe o no es de la tienda. */
export async function fetchPaymentProof(
  key: string,
  storeId: string,
): Promise<PaymentProofFile | null> {
  const ref = resolvePaymentProof(key, storeId);
  if (!ref) return null;
  const { client, bucket } = getStorage();
  try {
    const object = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!object.Body) return null;
    return {
      body: await object.Body.transformToByteArray(),
      contentType: object.ContentType || paymentProofContentType(ref.format),
    };
  } catch (error) {
    if (isMissingObject(error)) return null;
    throw error;
  }
}

/** Borra el objeto. `false` si la clave no era un comprobante de la tienda. */
export async function deletePaymentProof(
  key: string,
  storeId: string,
): Promise<boolean> {
  const ref = resolvePaymentProof(key, storeId);
  if (!ref) return false;
  const { client, bucket } = getStorage();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  return true;
}
