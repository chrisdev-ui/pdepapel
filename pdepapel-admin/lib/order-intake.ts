import { consumeOrderRateLimits } from "@/lib/order-rate-limit";
import {
  BOT_TRAP_ERROR,
  NAME_ERROR,
  PHONE_ERROR,
  RATE_LIMIT_ERROR,
  assessOrderRisk,
  elapsedSince,
  looksLikeRandomName,
  normalizeMobile,
  riskColumns,
  tripsBotTrap,
} from "@/lib/order-risk";
import { getClientKey } from "@/lib/rate-limit";

export interface StoreOrderScreenInput {
  scope: "checkout" | "orders" | "gift-card";
  storeId: string;
  fullName: string | null | undefined;
  email: string | null | undefined;
  phone: string | null | undefined;
  /** Sin teléfono se acepta solo donde el formulario lo deja opcional. */
  phoneRequired: boolean;
  /** Campo trampa del formulario: una persona nunca lo ve. */
  honeypot?: unknown;
  /** `Date.now()` del navegador al abrir el formulario. */
  formStartedAt?: unknown;
}

export type StoreOrderScreen =
  | { ok: true; phone: string; risk: { riskScore: number; riskReasons: string | null } }
  | { ok: false; status: 400 | 429; error: string };

/**
 * Filtro común de los pedidos que crea la tienda (checkout, pedido por
 * transferencia, tarjeta de regalo). Rechaza lo claramente automatizado o
 * inválido y devuelve el teléfono normalizado y las columnas de riesgo para
 * guardar con el pedido. Los pedidos del panel no pasan por aquí.
 */
export async function screenStoreOrder(req: Request, input: StoreOrderScreenInput): Promise<StoreOrderScreen> {
  const elapsedMs = elapsedSince(input.formStartedAt);
  if (tripsBotTrap({ honeypot: input.honeypot, elapsedMs })) return { ok: false, status: 400, error: BOT_TRAP_ERROR };
  if (looksLikeRandomName(input.fullName)) return { ok: false, status: 400, error: NAME_ERROR };

  const rawPhone = String(input.phone ?? "").trim();
  const phone = rawPhone ? normalizeMobile(rawPhone) : null;
  if ((rawPhone || input.phoneRequired) && !phone) return { ok: false, status: 400, error: PHONE_ERROR };

  const limits = await consumeOrderRateLimits({
    scope: input.scope,
    storeId: input.storeId,
    clientKey: getClientKey(req),
    email: input.email,
  });
  if (!limits.allowed) return { ok: false, status: 429, error: RATE_LIMIT_ERROR };

  const risk = riskColumns(assessOrderRisk({ email: input.email, elapsedMs, repeated: limits.repeated }));
  return { ok: true, phone: phone ?? "", risk };
}
