import "server-only";

import { STORE_SHIPPING_ORIGIN } from "@/constants/shipping";

export const STORE_SENDER_ENV = {
  firstName: "STORE_SENDER_FIRST_NAME",
  lastName: "STORE_SENDER_LAST_NAME",
  email: "STORE_SENDER_EMAIL",
  phone: "STORE_SENDER_PHONE",
  address: "STORE_SENDER_ADDRESS",
} as const;

const OPTIONAL_SENDER_ENV = {
  suburb: "STORE_SENDER_SUBURB",
  crossStreet: "STORE_SENDER_CROSS_STREET",
  reference: "STORE_SENDER_REFERENCE",
} as const;

type RequiredField = keyof typeof STORE_SENDER_ENV;
type OptionalField = keyof typeof OPTIONAL_SENDER_ENV;

export type StoreSender = typeof STORE_SHIPPING_ORIGIN &
  Record<RequiredField, string> &
  Record<OptionalField, string | null>;

const read = (name: string) => process.env[name]?.trim() || null;

/**
 * Remitente de los envíos. Los datos personales viven en variables de entorno
 * del servidor porque el repositorio es público; se leen al cotizar o generar
 * una guía, nunca al compilar.
 */
export function getStoreSender(): StoreSender {
  const missing = Object.values(STORE_SENDER_ENV).filter((name) => !read(name));
  if (missing.length > 0) {
    throw new Error(
      `Faltan variables del remitente de envíos: ${missing.join(", ")}. Configúralas en el proyecto de Vercel de la administración (solo servidor).`,
    );
  }
  const required = Object.fromEntries(
    Object.entries(STORE_SENDER_ENV).map(([field, name]) => [field, read(name)]),
  ) as Record<RequiredField, string>;
  const optional = Object.fromEntries(
    Object.entries(OPTIONAL_SENDER_ENV).map(([field, name]) => [field, read(name)]),
  ) as Record<OptionalField, string | null>;
  return { ...STORE_SHIPPING_ORIGIN, ...required, ...optional };
}
