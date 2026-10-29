import { createHash } from "node:crypto";

import {
  PreorderWaitlistChannel,
  PreorderWaitlistStatus,
  ProductPresaleStatus,
  type PreorderWaitlistEntry,
} from "@prisma/client";

import { NEWSLETTER_MIN_SUBMIT_MS, tripsNewsletterHoneypot } from "@/lib/newsletter-intake";
import { newsletterEmailKey } from "@/lib/newsletter-tokens";
import { elapsedSince } from "@/lib/order-risk";
import { emptyWaitlistCounts, type WaitlistCounts } from "@/lib/preorder-waitlist-shared";
import prismadb from "@/lib/prismadb";
import { consumeRateLimit, getClientKey } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";

/**
 * Lista de espera de una preventa. Nunca envía nada: la dueña contacta a mano
 * (wa.me). Teléfono, correo y nombre no van a los registros.
 */

/** Los límites del boletín con buckets propios, más uno por persona y producto. */
export const WAITLIST_RATE_LIMITS = {
  perIp: { limit: 5, windowSeconds: 60 * 60 },
  perContact: { limit: 3, windowSeconds: 24 * 60 * 60 },
  perContactProduct: { limit: 1, windowSeconds: 24 * 60 * 60 },
} as const;

export type WaitlistDropReason = "honeypot" | "too_fast" | "rate_ip" | "rate_contact" | "rate_contact_product";

export type WaitlistScreen = { action: "accept" } | { action: "drop"; reason: WaitlistDropReason };

const hashKey = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 32);

/** Claves de contacto para límites y duplicados: el teléfono en E.164 y el correo como el boletín. */
export function waitlistContactKeys(contact: { phone?: string | null; email?: string | null }): string[] {
  const keys: string[] = [];
  if (contact.phone) keys.push(`p:${contact.phone}`);
  if (contact.email) keys.push(`e:${newsletterEmailKey(contact.email)}`);
  return keys;
}

/**
 * El mismo filtro que `screenNewsletterSignup` (trampa, reloj de 3 s,
 * Turnstile que no bloquea, límites que fallan abiertos) con buckets
 * `waitlist:`: así una lista de espera no gasta el cupo del boletín, y el
 * contacto puede ser un teléfono.
 */
export async function screenWaitlistSignup(
  req: Request,
  input: {
    storeId: string;
    productId: string;
    phone: string | null;
    email: string | null;
    website?: unknown;
    company?: unknown;
    formStartedAt?: unknown;
    turnstileToken?: unknown;
  },
  now = Date.now(),
): Promise<WaitlistScreen> {
  if (tripsNewsletterHoneypot(input)) return { action: "drop", reason: "honeypot" };

  const elapsedMs = elapsedSince(input.formStartedAt, now);
  if (elapsedMs === null || elapsedMs < NEWSLETTER_MIN_SUBMIT_MS) return { action: "drop", reason: "too_fast" };

  const clientKey = getClientKey(req);
  const challenge = await verifyTurnstile(typeof input.turnstileToken === "string" ? input.turnstileToken : null, clientKey);
  if (!challenge.ok) console.warn("[PREORDER_WAITLIST] Turnstile no verificó el alta; siguen la trampa, el reloj y los límites.");

  const byIp = await consumeRateLimit({
    key: `waitlist:${input.storeId}:ip:${hashKey(clientKey)}`,
    ...WAITLIST_RATE_LIMITS.perIp,
  });
  if (!byIp.allowed) return { action: "drop", reason: "rate_ip" };

  const contacts = waitlistContactKeys(input).map(hashKey);
  const byContact = await Promise.all(
    contacts.map((contact) =>
      consumeRateLimit({ key: `waitlist:${input.storeId}:contact:${contact}`, ...WAITLIST_RATE_LIMITS.perContact }),
    ),
  );
  if (byContact.some((result) => !result.allowed)) return { action: "drop", reason: "rate_contact" };

  const byProduct = await Promise.all(
    contacts.map((contact) =>
      consumeRateLimit({
        key: `waitlist:${input.storeId}:product:${hashKey(input.productId)}:${contact}`,
        ...WAITLIST_RATE_LIMITS.perContactProduct,
      }),
    ),
  );
  if (byProduct.some((result) => !result.allowed)) return { action: "drop", reason: "rate_contact_product" };

  return { action: "accept" };
}

/** Condición de duplicado: mismo producto y mismo teléfono o correo, sin contar descartadas. */
export function waitlistDuplicateWhere(input: {
  storeId: string;
  productId: string;
  phone: string | null;
  email: string | null;
}) {
  const or: Array<{ phone: string } | { email: string }> = [];
  if (input.phone) or.push({ phone: input.phone });
  if (input.email) or.push({ email: input.email });
  if (or.length === 0) return null;
  return {
    storeId: input.storeId,
    productId: input.productId,
    status: { not: PreorderWaitlistStatus.DISCARDED },
    OR: or,
  };
}

export async function findDuplicateWaitlistEntry(input: {
  storeId: string;
  productId: string;
  phone: string | null;
  email: string | null;
}): Promise<PreorderWaitlistEntry | null> {
  const where = waitlistDuplicateWhere(input);
  if (!where) return null;
  return prismadb.preorderWaitlistEntry.findFirst({ where, orderBy: { createdAt: "asc" } });
}

export type CreateWaitlistEntryInput = {
  storeId: string;
  productId: string;
  presaleId: string | null;
  name: string;
  phone: string | null;
  handle: string | null;
  email: string | null;
  channel: PreorderWaitlistChannel;
  note: string | null;
  consentText?: string | null;
  consentVersion?: string | null;
  createdBy: string;
};

/**
 * Crea la entrada o devuelve la que ya existe para ese teléfono o correo. El
 * duplicado se busca en código (no hay índice único): dos altas exactamente a
 * la vez podrían quedar dobles, y la dueña descarta una a mano.
 */
export async function createOrReuseWaitlistEntry(
  input: CreateWaitlistEntryInput,
): Promise<{ entry: PreorderWaitlistEntry; created: boolean }> {
  const existing = await findDuplicateWaitlistEntry(input);
  if (existing) return { entry: existing, created: false };
  const entry = await prismadb.preorderWaitlistEntry.create({
    data: {
      storeId: input.storeId,
      productId: input.productId,
      presaleId: input.presaleId,
      name: input.name,
      phone: input.phone,
      handle: input.handle,
      email: input.email,
      channel: input.channel,
      note: input.note,
      consentText: input.consentText ?? null,
      consentVersion: input.consentVersion ?? null,
      createdBy: input.createdBy,
    },
  });
  return { entry, created: true };
}

/** La preventa activa del producto en esa tienda, o null. */
export async function findActivePresale(storeId: string, productId: string) {
  return prismadb.productPresale.findFirst({
    where: { storeId, productId, status: ProductPresaleStatus.ACTIVE },
    select: { id: true },
  });
}

export function countWaitlistByStatus(rows: Array<{ status: PreorderWaitlistStatus; _count: { _all: number } }>): WaitlistCounts {
  const counts = emptyWaitlistCounts();
  for (const row of rows) counts[row.status] = row._count._all;
  return counts;
}

export async function getWaitlistCounts(storeId: string, productId: string): Promise<WaitlistCounts> {
  const rows = await prismadb.preorderWaitlistEntry.groupBy({
    by: ["status"],
    where: { storeId, productId },
    _count: { _all: true },
  });
  return countWaitlistByStatus(rows as Array<{ status: PreorderWaitlistStatus; _count: { _all: number } }>);
}

export const WAITLIST_ENTRY_SELECT = {
  id: true,
  productId: true,
  presaleId: true,
  name: true,
  phone: true,
  handle: true,
  email: true,
  channel: true,
  note: true,
  status: true,
  consentVersion: true,
  orderId: true,
  contactedAt: true,
  createdBy: true,
  createdAt: true,
} as const;
