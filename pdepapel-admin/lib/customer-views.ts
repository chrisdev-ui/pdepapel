/**
 * Segmentos y vistas de Clientes (rediseño 2026-09).
 *
 * Un cliente se arma agrupando pedidos por teléfono normalizado. El segmento
 * usa la misma regla que la inteligencia de clientes: quien no compra hace
 * más de 90 días es inactivo; entre quienes sí compran, el 10 % que más ha
 * gastado es VIP, quien repite es recurrente y el resto ocasional. Quien
 * solo tiene pedidos pendientes o cancelados aparece como «sin compra».
 */

export const INACTIVE_AFTER_DAYS = 90;
export const VIP_SHARE = 0.1;

export type CustomerSegment = "vip" | "recurrente" | "ocasional" | "inactivo" | "sin-compra";

export const SEGMENT_LABELS: Record<CustomerSegment, { label: string; tone: "mint" | "sky" | "lavender" | "cream" | "slate" }> = {
  vip: { label: "VIP", tone: "mint" },
  recurrente: { label: "Recurrente", tone: "sky" },
  ocasional: { label: "Ocasional", tone: "lavender" },
  inactivo: { label: "Inactivo", tone: "cream" },
  "sin-compra": { label: "Sin compra", tone: "slate" },
};

export const CUSTOMER_VIEWS = [
  { id: "todos", label: "Todos" },
  { id: "vip", label: "VIP" },
  { id: "recurrentes", label: "Recurrentes" },
  { id: "inactivos", label: "Inactivos" },
  { id: "sin-compra", label: "Sin compra" },
] as const;

export type CustomerView = (typeof CUSTOMER_VIEWS)[number]["id"];
export const DEFAULT_CUSTOMER_VIEW: CustomerView = "todos";

export function isCustomerView(value: string | null | undefined): value is CustomerView {
  return CUSTOMER_VIEWS.some((view) => view.id === value);
}

export interface SegmentableCustomer {
  paidOrders: number;
  totalSpent: number;
  lastPaidAt: Date | null;
}

const PLACEHOLDER_NAMES = /^(cliente\s*nuevo|consumidor\s*final|clientes?\s*varios|sin\s*nombre|n\/a|na|-+)$/i;
// Misma lista que actions/get-customer-intelligence.ts: identidades internas de la tienda.
const PLACEHOLDER_EMAILS = new Set(["clientesvarios@gmail.com", "papeleria.pdepapel@gmail.com", "paufermr@gmail.com"]);

/**
 * Identidades de relleno usadas en ventas de mostrador o pedidos manuales
 * («cliente nuevo», «consumidor final», teléfono 300 000 0000, correo
 * clientesvarios@…). No son personas: quedan fuera de la lista y de los
 * segmentos para no inflar los VIP.
 */
export function isPlaceholderCustomer(input: { fullName: string; phone: string; email?: string | null }): boolean {
  if (PLACEHOLDER_NAMES.test(input.fullName.trim())) return true;
  const digits = normalizePhone(input.phone).replace(/^57/, "");
  if (digits.length < 7 || /^(\d)\1+$/.test(digits) || /^3?0{7,}$/.test(digits)) return true;
  const email = input.email?.trim().toLowerCase();
  return Boolean(email && PLACEHOLDER_EMAILS.has(email));
}

/** Teléfono a solo dígitos con indicativo de Colombia, para agrupar y para WhatsApp. */
export function normalizePhone(raw: string | null | undefined): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10 && digits.startsWith("3")) return `57${digits}`;
  return digits;
}

export function daysSince(date: Date | null, now = new Date()): number | null {
  if (!date) return null;
  return Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
}

/** Gasto mínimo para ser VIP: el 10 % superior entre quienes compran y siguen activos. */
export function computeVipThreshold(customers: SegmentableCustomer[], now = new Date()): number {
  const active = customers
    .filter((customer) => customer.paidOrders > 0 && (daysSince(customer.lastPaidAt, now) ?? Infinity) <= INACTIVE_AFTER_DAYS)
    .map((customer) => customer.totalSpent)
    .sort((a, b) => b - a);
  if (active.length === 0) return Infinity;
  const count = Math.max(1, Math.floor(active.length * VIP_SHARE));
  return active[count - 1];
}

export function getCustomerSegment(customer: SegmentableCustomer, vipThreshold: number, now = new Date()): CustomerSegment {
  if (customer.paidOrders === 0) return "sin-compra";
  const days = daysSince(customer.lastPaidAt, now);
  if (days === null || days > INACTIVE_AFTER_DAYS) return "inactivo";
  if (customer.totalSpent >= vipThreshold) return "vip";
  if (customer.paidOrders > 1) return "recurrente";
  return "ocasional";
}

export function customerMatchesView(segment: CustomerSegment, view: CustomerView): boolean {
  switch (view) {
    case "todos":
      return true;
    case "vip":
      return segment === "vip";
    case "recurrentes":
      return segment === "recurrente";
    case "inactivos":
      return segment === "inactivo";
    case "sin-compra":
      return segment === "sin-compra";
    default:
      return false;
  }
}

export interface CustomerSummary {
  total: number;
  buyers: number;
  vip: number;
  inactive: number;
  withoutPurchase: number;
}

export function summarizeCustomers(segments: CustomerSegment[]): CustomerSummary {
  return {
    total: segments.length,
    buyers: segments.filter((segment) => segment !== "sin-compra").length,
    vip: segments.filter((segment) => segment === "vip").length,
    inactive: segments.filter((segment) => segment === "inactivo").length,
    withoutPurchase: segments.filter((segment) => segment === "sin-compra").length,
  };
}

/** Enlace de WhatsApp con un mensaje ya escrito. */
export function buildWhatsAppLink(phone: string, message: string): string {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
}

export function buildReactivationMessage(input: { firstName: string; storeName: string; storeUrl: string }): string {
  const name = input.firstName.trim() || "hola";
  return `¡Hola, ${name}! Somos ${input.storeName}. Hace un tiempo no te vemos por la tienda y llegaron novedades kawaii que te pueden gustar. Mira lo nuevo aquí: ${input.storeUrl} 💌`;
}
