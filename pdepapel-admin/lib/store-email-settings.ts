import { z } from "zod";

import { ErrorFactory } from "@/lib/api-errors";
import { normalizeNewsletterEmail } from "@/lib/newsletter-tokens";
import { PLACEHOLDER_CUSTOMER_EMAILS } from "@/lib/placeholder-emails";
import prismadb from "@/lib/prismadb";
import { shortMemo } from "@/lib/short-memo";

/**
 * Dos listas de correos que la dueña edita en Configuración, para que ninguna
 * dirección personal viva en el código (el repositorio es público):
 *
 * - `excludedCustomerEmails`: el equipo que compra o registra pedidos con su
 *   propio correo. Junto con el correo de la tienda y el de relleno, queda
 *   fuera de clientas, segmentos y reactivación.
 * - `adminNotificationEmails`: quién recibe los avisos del panel (pedidos,
 *   alertas, formulario de contacto). Vacía, se usa el correo de la tienda.
 *
 * Nunca salen por una ruta pública.
 */
export const EMAIL_LIST_MAX_ENTRIES = 20;

const emailSchema = z.string().email();

/** Una dirección por línea (también acepta comas). Normaliza, quita repetidas y valida cada una. */
export function parseEmailList(raw: string | null | undefined, label = "La lista"): string[] {
  const entries = String(raw ?? "")
    .split(/[\n,;]+/)
    .map((entry) => normalizeNewsletterEmail(entry))
    .filter(Boolean);
  const unique = Array.from(new Set(entries));
  const invalid = unique.find((entry) => !emailSchema.safeParse(entry).success);
  if (invalid !== undefined) {
    throw ErrorFactory.InvalidRequest(`${label} tiene una línea que no es un correo válido: «${invalid.slice(0, 80)}»`);
  }
  if (unique.length > EMAIL_LIST_MAX_ENTRIES) {
    throw ErrorFactory.InvalidRequest(`${label} admite hasta ${EMAIL_LIST_MAX_ENTRIES} correos`);
  }
  return unique;
}

/** Lo guardado es de confianza a medias: una línea dañada se ignora en vez de tumbar un envío. */
function readStoredList(raw: string | null | undefined): string[] {
  return Array.from(
    new Set(
      String(raw ?? "")
        .split(/[\n,;]+/)
        .map((entry) => normalizeNewsletterEmail(entry))
        .filter((entry) => entry && emailSchema.safeParse(entry).success),
    ),
  );
}

export const storeEmailSettingsInputSchema = z.object({
  excludedCustomerEmails: z.string().max(4000),
  adminNotificationEmails: z.string().max(4000),
});
export type StoreEmailSettingsInput = z.infer<typeof storeEmailSettingsInputSchema>;

export interface StoreEmailSettings {
  excludedCustomerEmails: string[];
  adminNotificationEmails: string[];
  /** El correo de la tienda (`Store.email`): siempre excluido y respaldo de los avisos. */
  storeEmail: string | null;
}

export async function getStoreEmailSettings(storeId: string): Promise<StoreEmailSettings> {
  const [settings, store] = await Promise.all([
    prismadb.storeSettings.findUnique({
      where: { storeId },
      select: { excludedCustomerEmails: true, adminNotificationEmails: true },
    }),
    prismadb.store.findUnique({ where: { id: storeId }, select: { email: true } }),
  ]);
  const storeEmail = store?.email ? normalizeNewsletterEmail(store.email) : "";
  return {
    excludedCustomerEmails: readStoredList(settings?.excludedCustomerEmails),
    adminNotificationEmails: readStoredList(settings?.adminNotificationEmails),
    storeEmail: storeEmail && emailSchema.safeParse(storeEmail).success ? storeEmail : null,
  };
}

/** Solo estas dos columnas: guardar aquí no toca los datos del negocio ni el bot. */
export async function saveStoreEmailSettings(storeId: string, input: StoreEmailSettingsInput) {
  const excluded = parseEmailList(input.excludedCustomerEmails, "Correos del equipo");
  const recipients = parseEmailList(input.adminNotificationEmails, "Correos para avisos");
  const data = {
    excludedCustomerEmails: excluded.length ? excluded.join("\n") : null,
    adminNotificationEmails: recipients.length ? recipients.join("\n") : null,
  };
  await prismadb.storeSettings.upsert({
    where: { storeId },
    create: { storeId, ...data },
    update: data,
  });
}

/** Correos que no son clientas: el equipo, el correo de la tienda y el de relleno. */
export async function getExcludedCustomerEmails(storeId: string): Promise<Set<string>> {
  const settings = await getStoreEmailSettings(storeId);
  return new Set([
    ...settings.excludedCustomerEmails,
    ...(settings.storeEmail ? [settings.storeEmail] : []),
    ...PLACEHOLDER_CUSTOMER_EMAILS.map((email) => normalizeNewsletterEmail(email)),
  ]);
}

/**
 * Destinatarios de los avisos del panel. Con tienda: su lista, o su correo si
 * la lista está vacía. Sin tienda (alertas de toda la instalación, como la de
 * la base de datos): la unión de todas. Puede quedar vacía; quien envía
 * decide qué hacer entonces.
 */
export async function getAdminNotificationRecipients(storeId?: string): Promise<string[]> {
  return shortMemo({
    key: `admin-recipients:${storeId ?? "*"}`,
    build: async () => {
      const storeIds = storeId
        ? [storeId]
        : (await prismadb.store.findMany({ select: { id: true } })).map((store) => store.id);
      const all = new Set<string>();
      for (const id of storeIds) {
        const settings = await getStoreEmailSettings(id);
        const list = settings.adminNotificationEmails.length
          ? settings.adminNotificationEmails
          : settings.storeEmail
            ? [settings.storeEmail]
            : [];
        list.forEach((email) => all.add(email));
      }
      return Array.from(all);
    },
  });
}
