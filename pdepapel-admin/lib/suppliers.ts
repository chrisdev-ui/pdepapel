import { RestockOrderStatus } from "@prisma/client";
import { z } from "zod";

import { ErrorFactory } from "@/lib/api-errors";

/**
 * Proveedores (`Supplier`): reglas compartidas por la API, los loaders del
 * panel y el formulario. No toca la base de datos.
 *
 * - El nombre es único por tienda sin distinguir mayúsculas (la API lo
 *   comprueba antes del índice `@@unique([storeId, name])`).
 * - Un proveedor con productos o pedidos de aprovisionamiento no se elimina:
 *   los pedidos son historial de compras y los productos se reasignan.
 */

export const SUPPLIER_NAME_MIN_LENGTH = 2;
export const SUPPLIER_NAME_MAX_LENGTH = 80;
export const SUPPLIER_NIT_MAX_LENGTH = 32;
export const SUPPLIER_CONTACT_MAX_LENGTH = 120;
export const SUPPLIER_PHONE_MAX_LENGTH = 32;
export const SUPPLIER_EMAIL_MAX_LENGTH = 160;
export const SUPPLIER_NOTES_MAX_LENGTH = 2000;
export const SUPPLIER_LEAD_TIME_MAX_DAYS = 365;

/** Estados de un pedido de aprovisionamiento que siguen abiertos con el proveedor. */
export const OPEN_RESTOCK_STATUSES: RestockOrderStatus[] = [
  RestockOrderStatus.ORDERED,
  RestockOrderStatus.PARTIALLY_RECEIVED,
];

/** Estados que cuentan como una compra real (ni borrador ni cancelado). */
export const PURCHASE_RESTOCK_STATUSES: RestockOrderStatus[] = [
  RestockOrderStatus.ORDERED,
  RestockOrderStatus.PARTIALLY_RECEIVED,
  RestockOrderStatus.COMPLETED,
];

export const SUPPLIER_MESSAGES = {
  nameRequired: "Escribe el nombre del proveedor",
  nameMin: `El nombre debe tener al menos ${SUPPLIER_NAME_MIN_LENGTH} caracteres`,
  nameMax: `El nombre puede tener hasta ${SUPPLIER_NAME_MAX_LENGTH} caracteres`,
  nitMax: `El NIT o cédula puede tener hasta ${SUPPLIER_NIT_MAX_LENGTH} caracteres`,
  contactMax: `El nombre de contacto puede tener hasta ${SUPPLIER_CONTACT_MAX_LENGTH} caracteres`,
  phoneInvalid:
    "Escribe un teléfono válido: solo números, con el indicativo del país si aplica",
  emailInvalid: "Escribe un correo válido, por ejemplo ventas@proveedor.com",
  emailMax: `El correo puede tener hasta ${SUPPLIER_EMAIL_MAX_LENGTH} caracteres`,
  leadTimeInvalid: `El tiempo de entrega debe ser un número entero entre 0 y ${SUPPLIER_LEAD_TIME_MAX_DAYS} días`,
  notesMax: `Las notas pueden tener hasta ${SUPPLIER_NOTES_MAX_LENGTH} caracteres`,
} as const;

const PHONE_SEPARATORS = /[\s().-]/g;
const PHONE_PATTERN = /^\+?\d{7,15}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Quita espacios, puntos, guiones y paréntesis: "(300) 123-45 67" → "3001234567",
 * "+57 300 123 4567" → "+573001234567". Devuelve `""` cuando está vacío. No
 * borra letras ni otros símbolos: eso lo rechaza la validación, no se esconde.
 */
export function normalizeSupplierPhone(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.trim().replace(PHONE_SEPARATORS, "");
}

export function normalizeSupplierEmail(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.trim().toLowerCase();
}

export function isValidSupplierPhone(value: string) {
  return PHONE_PATTERN.test(value);
}

export function isValidSupplierEmail(value: string) {
  return value.length <= SUPPLIER_EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(value);
}

/** Clave de unicidad por tienda: nombre recortado en minúsculas. */
export function supplierNameKey(name: string) {
  return name.trim().toLocaleLowerCase("es-CO");
}

/** `null`/`undefined`/vacío → `null`; texto → recortado. */
const optionalText = (max: number, maxMessage: string) =>
  z.preprocess(
    (value) => (value === undefined || value === null ? "" : value),
    z
      .string({ invalid_type_error: "Valor inválido" })
      .trim()
      .max(max, maxMessage)
      .transform((value) => (value === "" ? null : value)),
  );

/**
 * Lo que aceptan POST y PATCH de la API. Los campos opcionales llegan a la
 * base como `null` cuando vienen vacíos, así un PATCH puede limpiarlos.
 */
export const supplierInputSchema = z.object({
  name: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z
      .string({
        required_error: SUPPLIER_MESSAGES.nameRequired,
        invalid_type_error: SUPPLIER_MESSAGES.nameRequired,
      })
      .min(1, SUPPLIER_MESSAGES.nameRequired)
      .min(SUPPLIER_NAME_MIN_LENGTH, SUPPLIER_MESSAGES.nameMin)
      .max(SUPPLIER_NAME_MAX_LENGTH, SUPPLIER_MESSAGES.nameMax),
  ),
  nit: optionalText(SUPPLIER_NIT_MAX_LENGTH, SUPPLIER_MESSAGES.nitMax),
  contactName: optionalText(
    SUPPLIER_CONTACT_MAX_LENGTH,
    SUPPLIER_MESSAGES.contactMax,
  ),
  phone: z.preprocess(
    normalizeSupplierPhone,
    z
      .string()
      .max(SUPPLIER_PHONE_MAX_LENGTH, SUPPLIER_MESSAGES.phoneInvalid)
      .refine(
        (value) => value === "" || isValidSupplierPhone(value),
        SUPPLIER_MESSAGES.phoneInvalid,
      )
      .transform((value) => (value === "" ? null : value)),
  ),
  email: z.preprocess(
    normalizeSupplierEmail,
    z
      .string()
      .max(SUPPLIER_EMAIL_MAX_LENGTH, SUPPLIER_MESSAGES.emailMax)
      .refine(
        (value) => value === "" || isValidSupplierEmail(value),
        SUPPLIER_MESSAGES.emailInvalid,
      )
      .transform((value) => (value === "" ? null : value)),
  ),
  leadTimeDays: z.preprocess(
    (value) => {
      if (value === undefined || value === null) return null;
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed === "") return null;
        return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
      }
      return value;
    },
    z
      .number({ invalid_type_error: SUPPLIER_MESSAGES.leadTimeInvalid })
      .int(SUPPLIER_MESSAGES.leadTimeInvalid)
      .min(0, SUPPLIER_MESSAGES.leadTimeInvalid)
      .max(SUPPLIER_LEAD_TIME_MAX_DAYS, SUPPLIER_MESSAGES.leadTimeInvalid)
      .nullable(),
  ),
  notes: optionalText(SUPPLIER_NOTES_MAX_LENGTH, SUPPLIER_MESSAGES.notesMax),
});

export type SupplierInput = z.infer<typeof supplierInputSchema>;

/** Valida el cuerpo de POST/PATCH; lanza `InvalidRequest` con el primer mensaje en español. */
export function parseSupplierInput(body: unknown): SupplierInput {
  const result = supplierInputSchema.safeParse(
    body && typeof body === "object" ? body : {},
  );
  if (!result.success) {
    const first = result.error.issues[0];
    throw ErrorFactory.InvalidRequest(
      first?.message ?? "Los datos del proveedor no son válidos",
      { field: first?.path.join(".") },
    );
  }
  return result.data;
}

/**
 * Lo que escribe la persona en el formulario: todo texto, con mensajes en
 * español. `toSupplierPayload` lo convierte en el cuerpo de la API.
 */
export const supplierFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, SUPPLIER_MESSAGES.nameRequired)
    .min(SUPPLIER_NAME_MIN_LENGTH, SUPPLIER_MESSAGES.nameMin)
    .max(SUPPLIER_NAME_MAX_LENGTH, SUPPLIER_MESSAGES.nameMax),
  nit: z.string().trim().max(SUPPLIER_NIT_MAX_LENGTH, SUPPLIER_MESSAGES.nitMax),
  contactName: z
    .string()
    .trim()
    .max(SUPPLIER_CONTACT_MAX_LENGTH, SUPPLIER_MESSAGES.contactMax),
  phone: z.string().refine((value) => {
    const normalized = normalizeSupplierPhone(value);
    return normalized === "" || isValidSupplierPhone(normalized);
  }, SUPPLIER_MESSAGES.phoneInvalid),
  email: z.string().refine((value) => {
    const normalized = normalizeSupplierEmail(value);
    return normalized === "" || isValidSupplierEmail(normalized);
  }, SUPPLIER_MESSAGES.emailInvalid),
  leadTimeDays: z.string().refine((value) => {
    const trimmed = value.trim();
    if (trimmed === "") return true;
    if (!/^\d+$/.test(trimmed)) return false;
    return Number(trimmed) <= SUPPLIER_LEAD_TIME_MAX_DAYS;
  }, SUPPLIER_MESSAGES.leadTimeInvalid),
  notes: z.string().max(SUPPLIER_NOTES_MAX_LENGTH, SUPPLIER_MESSAGES.notesMax),
});

export type SupplierFormValues = z.infer<typeof supplierFormSchema>;

export const EMPTY_SUPPLIER_FORM: SupplierFormValues = {
  name: "",
  nit: "",
  contactName: "",
  phone: "",
  email: "",
  leadTimeDays: "",
  notes: "",
};

/** Campos de `Supplier` que edita el formulario (sin ids ni fechas). */
export interface SupplierEditableFields {
  name: string;
  nit: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  leadTimeDays: number | null;
  notes: string | null;
}

export function supplierToFormValues(
  supplier: SupplierEditableFields,
): SupplierFormValues {
  return {
    name: supplier.name,
    nit: supplier.nit ?? "",
    contactName: supplier.contactName ?? "",
    phone: supplier.phone ?? "",
    email: supplier.email ?? "",
    leadTimeDays:
      supplier.leadTimeDays === null || supplier.leadTimeDays === undefined
        ? ""
        : String(supplier.leadTimeDays),
    notes: supplier.notes ?? "",
  };
}

/** Convierte los valores del formulario en el cuerpo que entiende la API. */
export function toSupplierPayload(values: SupplierFormValues): SupplierInput {
  return supplierInputSchema.parse(values);
}

/** Resumen de uso que muestran la lista, el encabezado y la tarjeta lateral. */
export interface SupplierUsageSummary {
  products: number;
  restockOrders: number;
  /** Pedidos en estado ORDERED. */
  orderedRestockOrders: number;
  /** Pedidos en estado PARTIALLY_RECEIVED. */
  receivingRestockOrders: number;
  /** `createdAt` del último pedido que cuenta como compra; `null` si no hay. */
  lastPurchaseAt: Date | null;
}

export interface SupplierRecentRestockOrder {
  id: string;
  orderNumber: string;
  status: RestockOrderStatus;
  createdAt: Date;
  totalAmount: number;
}

export interface SupplierDetail extends SupplierEditableFields {
  id: string;
  storeId: string;
  createdAt: Date;
  updatedAt: Date;
  usage: SupplierUsageSummary;
  recentRestockOrders: SupplierRecentRestockOrder[];
}

export interface SupplierRow extends SupplierEditableFields {
  id: string;
  storeId: string;
  createdAt: Date;
  updatedAt: Date;
  usage: SupplierUsageSummary;
  /** Copia plana de `usage.products` para la exportación CSV de la tabla. */
  products: number;
}

export const EMPTY_SUPPLIER_USAGE: SupplierUsageSummary = {
  products: 0,
  restockOrders: 0,
  orderedRestockOrders: 0,
  receivingRestockOrders: 0,
  lastPurchaseAt: null,
};

export function supplierHasReferences(
  usage: Pick<SupplierUsageSummary, "products" | "restockOrders">,
) {
  return usage.products > 0 || usage.restockOrders > 0;
}

const plural = (count: number, singular: string, pluralForm: string) =>
  `${count} ${count === 1 ? singular : pluralForm}`;

export function describeSupplierProducts(count: number) {
  return plural(count, "producto", "productos");
}

export function describeSupplierRestockOrders(count: number) {
  return plural(
    count,
    "pedido de aprovisionamiento",
    "pedidos de aprovisionamiento",
  );
}

/** "38 productos y 6 pedidos de aprovisionamiento lo referencian" (o solo una de las dos partes). */
export function describeSupplierReferences(
  usage: Pick<SupplierUsageSummary, "products" | "restockOrders">,
) {
  const parts: string[] = [];
  if (usage.products > 0) parts.push(describeSupplierProducts(usage.products));
  if (usage.restockOrders > 0) {
    parts.push(describeSupplierRestockOrders(usage.restockOrders));
  }
  if (parts.length === 0) return "";
  const single =
    parts.length === 1 && usage.products + usage.restockOrders === 1;
  return `${parts.join(" y ")} lo ${single ? "referencia" : "referencian"}`;
}

/** Mensaje 409 de la API y de la tarjeta «Eliminar proveedor». */
export function supplierDeleteBlockedMessage(
  usage: Pick<SupplierUsageSummary, "products" | "restockOrders">,
) {
  const advice: string[] = [];
  if (usage.products > 0) advice.push("Reasigna los productos");
  if (usage.restockOrders > 0) {
    advice.push(
      usage.products > 0
        ? "conserva los pedidos como historial"
        : "Conserva los pedidos como historial",
    );
  }
  return `No se puede eliminar: ${describeSupplierReferences(usage)}. ${advice.join(" y ")}.`;
}

export function duplicateSupplierMessage(name: string) {
  return `Ya existe un proveedor llamado «${name}» en esta tienda.`;
}

/** "1 recibiendo", "2 pedidos, 1 recibiendo" o "Ninguno". */
export function describeOpenRestockOrders(
  usage: Pick<
    SupplierUsageSummary,
    "orderedRestockOrders" | "receivingRestockOrders"
  >,
) {
  const parts: string[] = [];
  if (usage.orderedRestockOrders > 0) {
    parts.push(
      plural(usage.orderedRestockOrders, "pedido", "pedidos") + " en camino",
    );
  }
  if (usage.receivingRestockOrders > 0) {
    parts.push(`${usage.receivingRestockOrders} recibiendo`);
  }
  return parts.length > 0 ? parts.join(", ") : "Ninguno";
}

const SHORT_DATE = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "short",
  timeZone: "America/Bogota",
});
const SHORT_DATE_WITH_YEAR = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Bogota",
});
const YEAR_ONLY = new Intl.DateTimeFormat("es-CO", {
  year: "numeric",
  timeZone: "America/Bogota",
});

/** "5 de ago" (con año cuando no es el actual: "5 de ago de 2025"). */
export function formatSupplierDate(date: Date, now: Date = new Date()) {
  const sameYear = YEAR_ONLY.format(date) === YEAR_ONLY.format(now);
  const formatted = (sameYear ? SHORT_DATE : SHORT_DATE_WITH_YEAR)
    .format(date)
    .replace(/\./g, "");
  // ICU en es-CO ya escribe "5 de ago"; si otra versión omite el «de», se añade.
  if (formatted.includes(" de ")) return formatted;
  const [day, month, year] = formatted.split(" ");
  if (!day || !month) return formatted;
  return year ? `${day} de ${month} de ${year}` : `${day} de ${month}`;
}

/** Línea bajo el título: "Henko Importaciones · 38 productos · 6 pedidos de aprovisionamiento · última compra el 5 de ago". */
export function describeSupplierHeadline(
  name: string,
  usage: SupplierUsageSummary,
  now: Date = new Date(),
) {
  const parts = [
    name,
    describeSupplierProducts(usage.products),
    describeSupplierRestockOrders(usage.restockOrders),
  ];
  if (usage.lastPurchaseAt) {
    parts.push(
      `última compra el ${formatSupplierDate(usage.lastPurchaseAt, now)}`,
    );
  } else {
    parts.push("sin compras todavía");
  }
  return parts.join(" · ");
}

/** `true` cuando el error de Prisma es la violación del índice único (P2002). */
export function isUniqueConstraintError(error: unknown) {
  // Comprobación por forma (no `instanceof`) para que este módulo también
  // pueda importarse desde componentes cliente sin arrastrar el runtime.
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; name?: unknown };
  return (
    candidate.code === "P2002" &&
    candidate.name === "PrismaClientKnownRequestError"
  );
}

/**
 * Busca un nombre repetido entre candidatos de la misma tienda sin distinguir
 * mayúsculas ni acentos de mayúscula. Prisma en MySQL no acepta `mode`, así
 * que el filtro grueso lo hace la consulta y el fino se hace aquí.
 */
export function findDuplicateSupplierName<T extends { id: string; name: string }>(
  candidates: T[],
  name: string,
  excludeId?: string,
): T | undefined {
  const key = supplierNameKey(name);
  return candidates.find(
    (candidate) =>
      candidate.id !== excludeId && supplierNameKey(candidate.name) === key,
  );
}
