import { ErrorFactory } from "@/lib/api-errors";
import { normalizeCouponCode } from "@/lib/coupon-code";
import { normalizePromotionWindow, type PromotionWindow } from "@/lib/promotion-window";
import { DiscountType } from "@prisma/client";
import { z } from "zod";

/** Letras, números y guiones; entre 4 y 20 caracteres; sin guion al inicio o al final. */
export const COUPON_CODE_PATTERN = /^[A-Z0-9](?:[A-Z0-9-]{2,18})[A-Z0-9]$/;
export const COUPON_CODE_MESSAGE = "El código debe tener entre 4 y 20 caracteres: solo letras, números y guiones";

const dateInput = z.union([z.string().min(1), z.date()]);

const optionalLimit = z.preprocess(
  (value) => (value === "" || value === undefined || value === null ? null : value),
  z.union([z.coerce.number().int("El máximo de usos debe ser un número entero").min(1, "El máximo de usos debe ser al menos 1"), z.null()]),
);

export const couponInputSchema = z
  .object({
    code: z
      .string({ required_error: "Escribe el código del cupón" })
      .transform(normalizeCouponCode)
      .pipe(z.string().regex(COUPON_CODE_PATTERN, COUPON_CODE_MESSAGE)),
    type: z.nativeEnum(DiscountType, { errorMap: () => ({ message: "Elige el tipo de descuento" }) }),
    amount: z.coerce.number({ invalid_type_error: "El monto debe ser un número" }).positive("El descuento debe ser mayor a 0"),
    startDate: dateInput,
    endDate: dateInput,
    maxUses: optionalLimit.optional().default(null),
    minOrderValue: z.preprocess(
      (value) => (value === "" || value === undefined || value === null ? 0 : value),
      z.coerce.number({ invalid_type_error: "La compra mínima debe ser un número" }).min(0, "La compra mínima no puede ser negativa"),
    ),
    isActive: z.boolean().optional().default(true),
    isWelcomeBenefit: z.boolean().optional().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.type === DiscountType.PERCENTAGE && value.amount > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["amount"], message: "El porcentaje no puede ser mayor a 100" });
    }
    if (value.type === DiscountType.PERCENTAGE && !Number.isInteger(value.amount)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["amount"], message: "El porcentaje debe ser un número entero" });
    }
  });

export type CouponInput = Omit<z.output<typeof couponInputSchema>, "startDate" | "endDate"> & PromotionWindow;

/** Valida el cuerpo de POST/PATCH y devuelve los datos listos para guardar; lanza 400 con el primer error. */
export function parseCouponInput(body: unknown): CouponInput {
  const parsed = couponInputSchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw ErrorFactory.InvalidRequest(parsed.error.issues[0]?.message ?? "Datos del cupón no válidos");
  }
  const window = normalizePromotionWindow(parsed.data.startDate, parsed.data.endDate);
  if (!window.ok) throw ErrorFactory.InvalidRequest(window.error);
  const { startDate: _start, endDate: _end, ...rest } = parsed.data;
  return { ...rest, ...window.window };
}

/** Campos del cupón que devuelve el panel; nunca la fila completa a la tienda. */
export const COUPON_SELECT = {
  id: true,
  code: true,
  type: true,
  amount: true,
  startDate: true,
  endDate: true,
  maxUses: true,
  usedCount: true,
  isActive: true,
  minOrderValue: true,
  isWelcomeBenefit: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Lo único que la tienda necesita de un cupón validado. */
export const PUBLIC_COUPON_SELECT = {
  id: true,
  code: true,
  type: true,
  amount: true,
  minOrderValue: true,
  isActive: true,
  isWelcomeBenefit: true,
} as const;

/** Genera códigos sin caracteres ambiguos (sin O, 0, I, 1) para lotes. */
export const BATCH_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const BATCH_SUFFIX_LENGTH = 5;
export const MAX_BATCH_SIZE = 100;

export function buildBatchCode(prefix: string, random: () => number = Math.random): string {
  let suffix = "";
  for (let index = 0; index < BATCH_SUFFIX_LENGTH; index += 1) {
    suffix += BATCH_CODE_ALPHABET.charAt(Math.floor(random() * BATCH_CODE_ALPHABET.length));
  }
  return prefix ? `${prefix}-${suffix}` : suffix;
}

export const couponBatchInputSchema = z
  .object({
    prefix: z
      .string()
      .transform(normalizeCouponCode)
      .pipe(z.string().max(12, "El prefijo no puede tener más de 12 caracteres").regex(/^[A-Z0-9]*$/, "El prefijo solo admite letras y números")),
    quantity: z.coerce.number().int().min(1, "Crea al menos un cupón").max(MAX_BATCH_SIZE, `Hasta ${MAX_BATCH_SIZE} cupones por lote`),
    type: z.nativeEnum(DiscountType, { errorMap: () => ({ message: "Elige el tipo de descuento" }) }),
    amount: z.coerce.number().positive("El descuento debe ser mayor a 0"),
    maxUses: optionalLimit.optional().default(1),
    minOrderValue: z.preprocess((value) => (value === "" || value == null ? 0 : value), z.coerce.number().min(0)),
    startDate: dateInput,
    endDate: dateInput,
  })
  .superRefine((value, ctx) => {
    if (value.type === DiscountType.PERCENTAGE && value.amount > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["amount"], message: "El porcentaje no puede ser mayor a 100" });
    }
  });

export type CouponBatchInput = Omit<z.output<typeof couponBatchInputSchema>, "startDate" | "endDate"> & PromotionWindow;

export function parseCouponBatchInput(body: unknown): CouponBatchInput {
  const parsed = couponBatchInputSchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw ErrorFactory.InvalidRequest(parsed.error.issues[0]?.message ?? "Datos del lote no válidos");
  }
  const window = normalizePromotionWindow(parsed.data.startDate, parsed.data.endDate);
  if (!window.ok) throw ErrorFactory.InvalidRequest(window.error);
  const { startDate: _start, endDate: _end, ...rest } = parsed.data;
  return { ...rest, ...window.window };
}
