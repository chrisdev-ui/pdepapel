import { ErrorFactory } from "@/lib/api-errors";
import { normalizePromotionWindow, type PromotionWindow } from "@/lib/promotion-window";
import { currencyFormatter } from "@/lib/utils";
import { DiscountType, type PrismaClient } from "@prisma/client";
import { z } from "zod";

export const OFFER_NAME_MAX = 80;
export const OFFER_LABEL_MAX = 40;

const dateInput = z.union([z.string().min(1), z.date()]);
const idList = z.array(z.string().min(1)).optional().default([]);

export const offerInputSchema = z
  .object({
    name: z.string({ required_error: "Escribe el nombre interno" }).trim().min(1, "Escribe el nombre interno").max(OFFER_NAME_MAX, `El nombre no puede tener más de ${OFFER_NAME_MAX} caracteres`),
    label: z
      .preprocess((value) => (typeof value === "string" ? value.trim() : value), z.union([z.string().max(OFFER_LABEL_MAX, `La etiqueta no puede tener más de ${OFFER_LABEL_MAX} caracteres`), z.null()]))
      .optional()
      .default(null)
      .transform((value) => (value ? value : null)),
    type: z.nativeEnum(DiscountType, { errorMap: () => ({ message: "Elige el tipo de descuento" }) }),
    amount: z.coerce.number({ invalid_type_error: "El monto debe ser un número" }).positive("El descuento debe ser mayor a 0"),
    startDate: dateInput,
    endDate: dateInput,
    isActive: z.boolean().optional().default(true),
    productIds: idList,
    categoryIds: idList,
    productGroupIds: idList,
  })
  .superRefine((value, ctx) => {
    if (value.type === DiscountType.PERCENTAGE && value.amount > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["amount"], message: "El porcentaje no puede ser mayor a 100" });
    }
    if (value.productIds.length + value.categoryIds.length + value.productGroupIds.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["productIds"], message: "Elige al menos un producto, grupo o subcategoría" });
    }
  });

export type OfferInput = Omit<z.output<typeof offerInputSchema>, "startDate" | "endDate"> & PromotionWindow;

export function parseOfferInput(body: unknown): OfferInput {
  const parsed = offerInputSchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw ErrorFactory.InvalidRequest(parsed.error.issues[0]?.message ?? "Datos de la oferta no válidos");
  }
  const window = normalizePromotionWindow(parsed.data.startDate, parsed.data.endDate);
  if (!window.ok) throw ErrorFactory.InvalidRequest(window.error);
  const { startDate: _start, endDate: _end, ...rest } = parsed.data;
  return {
    ...rest,
    productIds: Array.from(new Set(rest.productIds)),
    categoryIds: Array.from(new Set(rest.categoryIds)),
    productGroupIds: Array.from(new Set(rest.productGroupIds)),
    ...window.window,
  };
}

type OfferDatabase = Pick<PrismaClient, "product" | "category" | "productGroup">;

/** Cada destino de la oferta debe pertenecer a la tienda; un id ajeno o inexistente es un 400, no un error de Prisma. */
export async function assertOfferTargetsInStore(db: OfferDatabase, storeId: string, input: Pick<OfferInput, "productIds" | "categoryIds" | "productGroupIds">) {
  const [products, categories, groups] = await Promise.all([
    input.productIds.length ? db.product.count({ where: { storeId, id: { in: input.productIds } } }) : 0,
    input.categoryIds.length ? db.category.count({ where: { storeId, id: { in: input.categoryIds } } }) : 0,
    input.productGroupIds.length ? db.productGroup.count({ where: { storeId, id: { in: input.productGroupIds } } }) : 0,
  ]);
  if (products !== input.productIds.length) throw ErrorFactory.InvalidRequest("Alguno de los productos elegidos no existe o no pertenece a esta tienda");
  if (categories !== input.categoryIds.length) throw ErrorFactory.InvalidRequest("Alguna de las subcategorías elegidas no existe o no pertenece a esta tienda");
  if (groups !== input.productGroupIds.length) throw ErrorFactory.InvalidRequest("Alguno de los grupos elegidos no existe o no pertenece a esta tienda");
}

/** Un monto fijo igual o mayor al precio dejaría el producto gratis: se rechaza nombrando los productos. */
export async function assertFixedAmountBelowPrices(db: Pick<PrismaClient, "product">, storeId: string, input: Pick<OfferInput, "type" | "amount" | "productIds" | "categoryIds" | "productGroupIds">) {
  if (input.type !== DiscountType.FIXED) return;
  const affected = await db.product.findMany({
    where: {
      storeId,
      isArchived: false,
      price: { lte: input.amount },
      OR: [
        ...(input.productIds.length ? [{ id: { in: input.productIds } }] : []),
        ...(input.categoryIds.length ? [{ categoryId: { in: input.categoryIds } }] : []),
        ...(input.productGroupIds.length ? [{ productGroupId: { in: input.productGroupIds } }] : []),
      ],
    },
    select: { name: true },
    take: 3,
  });
  if (affected.length === 0) return;
  throw ErrorFactory.InvalidRequest(
    `Un descuento de ${currencyFormatter(input.amount)} dejaría en $ 0 a ${affected.map((product) => product.name).join(", ")}${affected.length === 3 ? " y otros" : ""}. Baja el monto o usa un porcentaje.`,
  );
}

/** Carga de destinos para `create`/`update` en Prisma. */
export function offerTargetsData(input: Pick<OfferInput, "productIds" | "categoryIds" | "productGroupIds">) {
  return {
    products: { create: input.productIds.map((id) => ({ product: { connect: { id } } })) },
    categories: { create: input.categoryIds.map((id) => ({ category: { connect: { id } } })) },
    productGroups: { create: input.productGroupIds.map((id) => ({ productGroup: { connect: { id } } })) },
  };
}
