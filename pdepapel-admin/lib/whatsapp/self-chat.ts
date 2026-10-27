import { MarketplaceProvider, Prisma } from "@prisma/client";

import prismadb from "@/lib/prismadb";
import type { WhatsAppWebhookPayload } from "@/lib/whatsapp/webhook";

/**
 * El chat de Paula consigo misma en la app de WhatsApp Business («Tú»).
 *
 * Meta lo manda como eco (`smb_message_echoes`) igual que lo que ella le
 * contesta a una clienta. Lo único que lo distingue: el eco va del número del
 * negocio al mismo número (`to == from == metadata.display_phone_number`) o,
 * cuando no trae teléfono, al BSUID del propio negocio. Un eco hacia una
 * clienta nunca es un comando: la clienta ya lo vio.
 */

/** Fila de QStash de los comandos de una tienda (sin «:», que QStash rechaza). */
export const selfChatLane = (storeId: string) => `self-${storeId}`;

export interface SelfChatIdentity {
  phone: string | null;
  bsuid: string | null;
}

export interface WhatsAppEchoItem {
  id: string | null;
  from: string | null;
  to: string | null;
  toUserId: string | null;
  /** Segundos Unix según WhatsApp. */
  timestamp: number | null;
  type: string | null;
  text: string | null;
  /** Número del negocio en ese cambio (`metadata.display_phone_number`), solo dígitos. */
  businessPhone: string | null;
}

export interface SelfChatScan {
  echoes: Array<WhatsAppEchoItem & { selfChat: boolean }>;
  /** Todo el cuerpo es chat consigo misma: no hay mensajes, estados ni ecos hacia clientas. */
  onlySelfChat: boolean;
  /** Identidad aprendida de un eco que coincide por teléfono (el BSUID sale de `to_user_id`). */
  learned: SelfChatIdentity;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
};

export const phoneDigits = (value: string | null | undefined): string | null => (value ? value.replace(/\D/g, "") || null : null);

/** Regla 1: del negocio al mismo número del negocio. Regla 2: al BSUID ya conocido del negocio. */
export function isSelfChatEcho(echo: Pick<WhatsAppEchoItem, "from" | "to" | "toUserId" | "businessPhone">, knownBsuid: string | null): boolean {
  const from = phoneDigits(echo.from);
  const to = phoneDigits(echo.to);
  if (from && to && echo.businessPhone && from === to && to === echo.businessPhone) return true;
  return Boolean(knownBsuid && echo.toUserId && echo.toUserId === knownBsuid);
}

/** Lee los ecos del cuerpo y marca cuáles son del chat consigo misma. Nunca lanza. */
export function scanSelfChat(payload: WhatsAppWebhookPayload, knownBsuid: string | null): SelfChatScan {
  const echoes: SelfChatScan["echoes"] = [];
  let other = 0;
  const learned: SelfChatIdentity = { phone: null, bsuid: null };
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (!isRecord(change) || !isRecord(change.value)) {
        other += 1;
        continue;
      }
      const value = change.value;
      const metadata = isRecord(value.metadata) ? value.metadata : {};
      const businessPhone = phoneDigits(text(metadata.display_phone_number));
      const messages = Array.isArray(value.messages) ? value.messages.length : 0;
      const statuses = Array.isArray(value.statuses) ? value.statuses.length : 0;
      const rawEchoes: unknown[] = Array.isArray(value.message_echoes) ? value.message_echoes : [];
      other += messages + statuses;
      // Un cambio sin nada de esto (plantillas, estado de la cuenta) tampoco es chat consigo misma.
      if (messages + statuses + rawEchoes.length === 0) other += 1;
      for (const raw of rawEchoes) {
        if (!isRecord(raw)) {
          other += 1;
          continue;
        }
        const body = isRecord(raw.text) ? text(raw.text.body) : null;
        const seconds = Number(text(raw.timestamp));
        const item: WhatsAppEchoItem = {
          id: text(raw.id),
          from: text(raw.from),
          to: text(raw.to),
          toUserId: text(raw.to_user_id),
          timestamp: Number.isFinite(seconds) && seconds > 0 ? seconds : null,
          type: text(raw.type),
          text: body,
          businessPhone,
        };
        const byPhone = isSelfChatEcho(item, null);
        const selfChat = byPhone || isSelfChatEcho(item, knownBsuid);
        if (byPhone) {
          learned.phone ??= businessPhone;
          learned.bsuid ??= item.toUserId;
        }
        if (!selfChat) other += 1;
        echoes.push({ ...item, selfChat });
      }
    }
  }
  return { echoes, onlySelfChat: echoes.length > 0 && other === 0 && echoes.every((echo) => echo.selfChat), learned };
}

/** El número del negocio en el cuerpo, aunque no haya ecos: viene en todos los cambios. */
export function businessPhoneOf(payload: WhatsAppWebhookPayload): string | null {
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (!isRecord(change) || !isRecord(change.value) || !isRecord(change.value.metadata)) continue;
      const phone = phoneDigits(text(change.value.metadata.display_phone_number));
      if (phone) return phone;
    }
  }
  return null;
}

export async function loadSelfChatIdentity(storeId: string): Promise<SelfChatIdentity> {
  const row = await prismadb.marketplaceConnection.findUnique({
    where: { storeId_provider: { storeId, provider: MarketplaceProvider.WHATSAPP } },
    select: { selfPhone: true, selfBsuid: true },
  });
  return { phone: row?.selfPhone ?? null, bsuid: row?.selfBsuid ?? null };
}

/**
 * Conversaciones que no son el chat consigo misma. Un `not` de Prisma sobre
 * una columna nula deja fuera también las filas con NULL (`phone <> x` es
 * NULL en SQL), así que cada lado acepta el NULL explícito.
 */
export function notSelfChatWhere(identity: SelfChatIdentity): Prisma.ConversationWhereInput {
  const and: Prisma.ConversationWhereInput[] = [];
  if (identity.phone) and.push({ OR: [{ phone: null }, { phone: { not: identity.phone } }] });
  if (identity.bsuid) and.push({ OR: [{ bsuid: null }, { bsuid: { not: identity.bsuid } }] });
  return and.length ? { AND: and } : {};
}

/** Lo mismo para SQL crudo, sobre el alias de `Conversation`. Empieza con AND. */
export function notSelfChatSql(identity: SelfChatIdentity, alias = "c"): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  const column = (name: string) => Prisma.raw(`${alias}.\`${name}\``);
  if (identity.phone) parts.push(Prisma.sql`AND (${column("phone")} IS NULL OR ${column("phone")} <> ${identity.phone})`);
  if (identity.bsuid) parts.push(Prisma.sql`AND (${column("bsuid")} IS NULL OR ${column("bsuid")} <> ${identity.bsuid})`);
  return parts.length ? Prisma.join(parts, " ") : Prisma.empty;
}
