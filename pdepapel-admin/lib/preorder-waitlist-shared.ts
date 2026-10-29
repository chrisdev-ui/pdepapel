import { z } from "zod";

import { KNOWN_LEGAL_VERSIONS } from "@/lib/legal-versions";
import { normalizePhone } from "@/lib/phone";

/**
 * Lista de espera de una preventa, sin base de datos: lo usan las rutas y el
 * panel (que no puede importar `lib/preorder-waitlist.ts` porque ese lee Prisma).
 */

export const WAITLIST_STATUSES = ["WAITING", "CONTACTED", "CONVERTED", "DISCARDED"] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

/** Canales que se anotan a mano en el panel. WEB solo lo pone la ruta pública. */
export const PANEL_WAITLIST_CHANNELS = ["WHATSAPP", "INSTAGRAM", "TIKTOK", "OTHER"] as const;
export type PanelWaitlistChannel = (typeof PANEL_WAITLIST_CHANNELS)[number];

export const WAITLIST_CHANNEL_LABELS: Record<PanelWaitlistChannel | "WEB", string> = {
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  WEB: "Tienda en línea",
  OTHER: "Otro",
};

export type WaitlistCounts = Record<WaitlistStatus, number>;

export const emptyWaitlistCounts = (): WaitlistCounts => ({ WAITING: 0, CONTACTED: 0, CONVERTED: 0, DISCARDED: 0 });

const E164 = /^\+\d{8,15}$/;
const HANDLE = /^[A-Za-z0-9._]{1,79}$/;

/** El teléfono en E.164 (Colombia por defecto) o null si no parece un número. */
export function normalizeWaitlistPhone(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const normalized = normalizePhone(trimmed);
  return E164.test(normalized) ? normalized : null;
}

/** «@usuario» o «usuario» → «usuario»; null si trae caracteres que una red no permite. */
export function normalizeWaitlistHandle(value: string | null | undefined): string | null {
  const trimmed = value?.trim().replace(/^@+/, "");
  if (!trimmed) return null;
  return HANDLE.test(trimmed) ? trimmed : null;
}

export function normalizeWaitlistEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

/**
 * El campo único del panel («teléfono o @»): con @ o con letras es un usuario
 * de red; si no, un teléfono.
 */
export function splitWaitlistContact(value: string): { phone?: string; handle?: string } {
  const trimmed = value.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith("@") || /[A-Za-z_]/.test(trimmed)) return { handle: trimmed };
  return { phone: trimmed };
}

/** Solo los dígitos, para `https://wa.me/<dígitos>`. */
export const waitlistWhatsappLink = (phone: string) => `https://wa.me/${phone.replace(/[^\d]/g, "")}`;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null));

const CONTACT_REQUIRED = "Escribe un teléfono, un @usuario o un correo";

/** Los tres contactos ya normalizados; al menos uno. */
const contactFields = z
  .object({
    phone: optionalText(40),
    handle: optionalText(81),
    email: optionalText(191),
  })
  .superRefine((value, ctx) => {
    if (value.phone && !normalizeWaitlistPhone(value.phone)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["phone"], message: "El teléfono no es válido" });
    }
    if (value.handle && !normalizeWaitlistHandle(value.handle)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["handle"], message: "El @usuario no es válido" });
    }
    if (value.email && !z.string().email().safeParse(value.email).success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["email"], message: "El correo no es válido" });
    }
    if (!value.phone && !value.handle && !value.email) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["phone"], message: CONTACT_REQUIRED });
    }
  });

const nameField = z.string().trim().min(1, "Escribe el nombre").max(120, "El nombre es muy largo");

/** Alta desde el panel. */
export const panelWaitlistEntrySchema = z
  .object({
    productId: z.string().trim().min(1, "Falta el producto"),
    name: nameField,
    channel: z.enum(PANEL_WAITLIST_CHANNELS, { errorMap: () => ({ message: "Elige un canal" }) }),
    note: optionalText(1000),
  })
  .and(contactFields)
  .transform((value) => ({
    productId: value.productId,
    name: value.name,
    channel: value.channel,
    note: value.note,
    phone: normalizeWaitlistPhone(value.phone),
    handle: normalizeWaitlistHandle(value.handle),
    email: normalizeWaitlistEmail(value.email),
  }));

export type PanelWaitlistEntryInput = z.infer<typeof panelWaitlistEntrySchema>;

/** Alta desde la tienda en línea: sin @usuario, con consentimiento. */
export const publicWaitlistSignupSchema = z
  .object({
    productId: z.string().trim().min(1).max(191),
    name: nameField,
    phone: optionalText(40),
    email: optionalText(191),
    consentText: z.string().trim().min(1, "Acepta el contacto para continuar").max(500),
    consentVersion: z
      .string()
      .trim()
      .max(32)
      .refine((value) => (KNOWN_LEGAL_VERSIONS.privacy as readonly string[]).includes(value), {
        message: "Recarga la página e inténtalo de nuevo",
      }),
  })
  .superRefine((value, ctx) => {
    if (value.phone && !normalizeWaitlistPhone(value.phone)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["phone"], message: "El WhatsApp no es válido" });
    }
    if (value.email && !z.string().email().safeParse(value.email).success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["email"], message: "El correo no es válido" });
    }
    if (!value.phone && !value.email) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["phone"], message: "Escribe tu WhatsApp o tu correo" });
    }
  })
  .transform((value) => ({
    productId: value.productId,
    name: value.name,
    phone: normalizeWaitlistPhone(value.phone),
    email: normalizeWaitlistEmail(value.email),
    consentText: value.consentText,
    consentVersion: value.consentVersion,
  }));

export type PublicWaitlistSignupInput = z.infer<typeof publicWaitlistSignupSchema>;

/**
 * Cambios de estado a mano. CONVERTED no está: solo lo pone «Marcar anticipo
 * recibido», que además crea el pedido.
 */
export const waitlistStatusPatchSchema = z.object({
  status: z.enum(["WAITING", "CONTACTED", "DISCARDED"], {
    errorMap: () => ({ message: "Ese estado no se puede poner a mano" }),
  }),
});

export interface WaitlistEntryRow {
  id: string;
  productId: string;
  presaleId: string | null;
  name?: string;
  phone?: string | null;
  handle?: string | null;
  email?: string | null;
  note?: string | null;
  channel: PanelWaitlistChannel | "WEB";
  status: WaitlistStatus;
  orderId: string | null;
  contactedAt: string | null;
  createdAt: string;
}

export interface WaitlistResponse {
  entries: WaitlistEntryRow[];
  counts: WaitlistCounts;
}

/** La respuesta de la ruta pública, igual para un alta guardada y una descartada. */
export const WAITLIST_ACCEPTED_MESSAGE = "Listo, te avisamos cuando abra la preventa o llegue.";
