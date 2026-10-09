/**
 * Señales de pedido automatizado en la tienda. Las reglas que rechazan son
 * pocas y estrictas (trampa llena, envío en menos de unos segundos, celular
 * colombiano inválido, nombre de letras al azar); el resto solo suma riesgo,
 * porque un falso positivo es una venta perdida. La copia de la tienda
 * (`pdepapel-store/lib/customer-checks.ts`) repite las dos validaciones de
 * formulario con los mismos casos de prueba.
 */

export const PHONE_ERROR = "Escribe un celular válido: 10 dígitos que empiezan por 3.";
export const NAME_ERROR = "Revisa tu nombre: escríbelo como en tu documento, sin letras al azar ni números.";
export const BOT_TRAP_ERROR = "No pudimos procesar el pedido. Recarga la página e inténtalo de nuevo.";
export const RATE_LIMIT_ERROR = "Hiciste varios pedidos seguidos. Espera unos minutos e inténtalo de nuevo.";

/** Menos que esto entre abrir el formulario y enviarlo no lo hace una persona. */
export const MIN_SUBMIT_MS = 2_500;
/** Rápido pero posible con autocompletar: no se rechaza, suma riesgo. */
export const FAST_SUBMIT_MS = 15_000;
/** Desde este puntaje el pedido se marca «Posible bot». */
export const RISK_FLAG_SCORE = 2;
/** Una primera compra de tarjeta desde este valor espera aprobación antes de emitir el código. */
export const GIFT_CARD_REVIEW_AMOUNT = 100_000;

export type RiskReason =
  | "envio-rapido"
  | "correo-variante"
  | "pedidos-repetidos"
  | "fraude-previo"
  | "fraude-confirmado"
  | "pago-en-cancelado";

export const RISK_REASON_LABELS: Record<RiskReason, string> = {
  "envio-rapido": "Formulario enviado en segundos",
  "correo-variante": "Correo con puntos o «+» de más",
  "pedidos-repetidos": "Varios pedidos seguidos desde la misma conexión o correo",
  "fraude-previo": "Mismo correo o celular que un pedido cancelado como fraude",
  "fraude-confirmado": "Cancelado como fraude o bot",
  "pago-en-cancelado": "Pago recibido en pedido cancelado — revisar o reembolsar",
};

const RISK_WEIGHTS: Record<RiskReason, number> = {
  "envio-rapido": 2,
  "correo-variante": 1,
  "pedidos-repetidos": 2,
  "fraude-previo": 3,
  "fraude-confirmado": 10,
  "pago-en-cancelado": 0,
};

/**
 * Celular en formato internacional, o `null` si no vale. Sin indicativo o con
 * +57 tiene que ser un celular colombiano (10 dígitos que empiezan por 3); un
 * número con otro indicativo se acepta si tiene un largo posible, porque una
 * tarjeta de regalo la puede comprar alguien desde fuera.
 */
export function normalizeMobile(input: string | null | undefined): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  const international = raw.startsWith("+") || raw.startsWith("00");
  const withoutPrefix = raw.startsWith("00") ? digits.slice(2) : digits;
  if (international && !withoutPrefix.startsWith("57")) {
    return withoutPrefix.length >= 8 && withoutPrefix.length <= 15 ? `+${withoutPrefix}` : null;
  }
  const national = withoutPrefix.length === 12 && withoutPrefix.startsWith("57") ? withoutPrefix.slice(2) : withoutPrefix;
  return /^3\d{9}$/.test(national) ? `+57${national}` : null;
}

const VOWELS = /[aeiouyáéíóúüàèìòù]/i;

/** Letras al azar o con números; un solo nombre de pila es válido. */
export function looksLikeRandomName(input: string | null | undefined): boolean {
  const name = String(input ?? "").trim();
  if (!name) return true;
  if (/\d/.test(name)) return true;
  return name.split(/[\s'-]+/).some((word) => {
    if (word.length >= 5 && !VOWELS.test(word)) return true;
    if ((word.match(/[a-záéíóúñü][A-ZÁÉÍÓÚÑÜ]/g) ?? []).length >= 3) return true;
    return /[^aeiouyáéíóúüàèìòù\W\d_]{6,}/i.test(word);
  });
}

/** El mismo buzón de Gmail con o sin puntos y etiquetas `+` cuenta como uno. */
export function normalizeEmailForLimits(input: string | null | undefined): string {
  const [local = "", domain = ""] = String(input ?? "").trim().toLowerCase().split("@");
  if (!domain) return local;
  const base = local.split("+")[0];
  if (domain === "gmail.com" || domain === "googlemail.com") return `${base.replace(/\./g, "")}@gmail.com`;
  return `${base}@${domain}`;
}

export function isEmailVariant(input: string | null | undefined): boolean {
  const [local = "", domain = ""] = String(input ?? "").trim().toLowerCase().split("@");
  if (local.includes("+")) return true;
  return (domain === "gmail.com" || domain === "googlemail.com") && (local.match(/\./g) ?? []).length >= 3;
}

export interface BotTrapInput {
  honeypot?: unknown;
  /** Milisegundos entre abrir el formulario y enviarlo; `undefined` si el cliente no lo mandó. */
  elapsedMs?: number | null;
}

export function tripsBotTrap({ honeypot, elapsedMs }: BotTrapInput): boolean {
  if (typeof honeypot === "string" && honeypot.trim()) return true;
  return typeof elapsedMs === "number" && elapsedMs >= 0 && elapsedMs < MIN_SUBMIT_MS;
}

export function elapsedSince(startedAt: unknown, now = Date.now()): number | null {
  const started = typeof startedAt === "number" ? startedAt : Number(startedAt);
  if (!Number.isFinite(started) || started <= 0) return null;
  const elapsed = now - started;
  return elapsed >= 0 && elapsed < 24 * 60 * 60 * 1000 ? elapsed : null;
}

export interface RiskInput {
  email?: string | null;
  elapsedMs?: number | null;
  repeated?: boolean;
  /** El correo o el celular ya aparecen en un pedido cancelado como fraude. */
  priorFraud?: boolean;
}

export interface RiskAssessment {
  score: number;
  reasons: RiskReason[];
}

export function assessOrderRisk({ email, elapsedMs, repeated, priorFraud }: RiskInput): RiskAssessment {
  const reasons: RiskReason[] = [];
  if (typeof elapsedMs === "number" && elapsedMs < FAST_SUBMIT_MS) reasons.push("envio-rapido");
  if (isEmailVariant(email)) reasons.push("correo-variante");
  if (repeated) reasons.push("pedidos-repetidos");
  if (priorFraud) reasons.push("fraude-previo");
  return { score: reasons.reduce((total, reason) => total + RISK_WEIGHTS[reason], 0), reasons };
}

export const isFlagged = (order: { riskScore?: number | null }) => (order.riskScore ?? 0) >= RISK_FLAG_SCORE;

export function parseRiskReasons(value: string | null | undefined): RiskReason[] {
  return String(value ?? "")
    .split(",")
    .map((reason) => reason.trim())
    .filter((reason): reason is RiskReason => reason in RISK_REASON_LABELS);
}

export function riskColumns(assessment: RiskAssessment) {
  return { riskScore: assessment.score, riskReasons: assessment.reasons.length ? assessment.reasons.join(",") : null };
}

/** La primera compra de tarjeta grande o un pedido marcado esperan aprobación. */
export function needsGiftCardReview(input: { riskScore?: number | null; total: number; isFirstPurchase: boolean }) {
  return isFlagged(input) || (input.isFirstPurchase && input.total >= GIFT_CARD_REVIEW_AMOUNT);
}

/** Suma un motivo a los que ya tenía el pedido (sin repetir) y su peso al puntaje. */
export function withRiskReason(order: { riskScore?: number | null; riskReasons?: string | null }, reason: RiskReason) {
  const current = parseRiskReasons(order.riskReasons);
  if (current.includes(reason)) return { riskScore: order.riskScore ?? 0, riskReasons: order.riskReasons ?? null };
  return { riskScore: (order.riskScore ?? 0) + RISK_WEIGHTS[reason], riskReasons: [...current, reason].join(",") };
}

export const isFraudCancelled = (order: { riskReasons?: string | null }) =>
  parseRiskReasons(order.riskReasons).includes("fraude-confirmado");

export const FRAUD_REASON_CODE = "fraude-confirmado";
