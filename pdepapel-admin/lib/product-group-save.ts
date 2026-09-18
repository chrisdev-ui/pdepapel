import type { Prisma } from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";
import {
  getProductDeleteCheck,
  type ProductDeleteBlocker,
} from "@/lib/product-deletion";
import { normalizeProductIdentifiers } from "@/lib/product-identifiers";
import { sanitizeRichTextHtml } from "@/lib/rich-text";

/**
 * Reglas compartidas por `POST /product-groups` y `PATCH /product-groups/[id]`.
 *
 * Adoptar por id era un agujero: cualquier id valía (otra tienda, otro grupo,
 * un kit, un producto archivado) y el `update` no filtraba por tienda. Y al
 * adoptar se pisaban precio, costo, proveedor, descripción y GTIN del
 * producto con los del grupo. Ahora un producto solo se adopta si es de la
 * tienda, está suelto (o ya en este grupo), no es kit ni está archivado, y
 * de él solo cambia lo que la fila del formulario trae explícitamente.
 */

export interface VariantPayload {
  id?: string;
  sku?: string;
  name?: string;
  size?: { id: string };
  color?: { id: string };
  design?: { id: string };
  sizeId?: string;
  colorId?: string;
  designId?: string;
  price?: number | string;
  acqPrice?: number | string;
  supplierId?: string | null;
  isFeatured?: boolean;
  isArchived?: boolean;
  description?: string;
  images?: string[];
  gtin?: string | null;
  mpn?: string | null;
  hasNoProductIdentifier?: boolean;
}

export interface GroupDefaults {
  name: string;
  description: string;
  categoryId?: string;
  price?: number | string | null;
  acqPrice?: number | string | null;
  supplierId?: string | null;
  isFeatured?: boolean;
  /** Booleano solo cuando el formulario eligió «todas»; ausente = por variante. */
  isArchived?: boolean;
}

export type AdoptableClient = Pick<Prisma.TransactionClient, "product">;

export const ADOPTABLE_SELECT = {
  id: true,
  storeId: true,
  name: true,
  slug: true,
  sku: true,
  isKit: true,
  isArchived: true,
  productGroupId: true,
  createdAt: true,
} satisfies Prisma.ProductSelect;

export type AdoptableProduct = Prisma.ProductGetPayload<{
  select: typeof ADOPTABLE_SELECT;
}>;

export function variantAttributeIds(variant: VariantPayload) {
  return {
    sizeId: variant.size?.id || variant.sizeId,
    colorId: variant.color?.id || variant.colorId,
    designId: variant.design?.id || variant.designId,
  };
}

export function variantLabel(variant: VariantPayload) {
  return variant.name || variant.sku || "sin nombre";
}

/** Dos filas con el mismo id se pisarían entre sí (última gana) y duplicarían fotos. */
export function findDuplicateVariantId(variants: VariantPayload[]) {
  const seen = new Set<string>();
  for (const variant of variants) {
    if (!variant.id) continue;
    if (seen.has(variant.id)) return variant.id;
    seen.add(variant.id);
  }
  return null;
}

/**
 * Comprueba cada id que el formulario quiere adoptar o conservar. Devuelve
 * los productos por id, ya filtrados por tienda.
 */
export async function loadAdoptableProducts(
  db: AdoptableClient,
  {
    storeId,
    groupId,
    variants,
  }: { storeId: string; groupId: string | null; variants: VariantPayload[] },
): Promise<Map<string, AdoptableProduct>> {
  const ids = Array.from(
    new Set(
      variants.map((variant) => variant.id).filter((id): id is string => Boolean(id)),
    ),
  );
  if (ids.length === 0) return new Map();

  const products = await db.product.findMany({
    where: { id: { in: ids }, storeId },
    select: ADOPTABLE_SELECT,
  });
  const byId = new Map(products.map((product) => [product.id, product]));

  for (const id of ids) {
    const product = byId.get(id);
    if (!product) {
      throw ErrorFactory.NotFound(
        "Uno de los productos que intentas agrupar no existe en esta tienda.",
      );
    }
    if (product.productGroupId && product.productGroupId !== groupId) {
      throw ErrorFactory.Conflict(
        `«${product.name}» ya pertenece a otro grupo. Sácalo de ese grupo antes de traerlo a este.`,
        { productId: product.id, reason: "other-group" },
      );
    }
    if (product.isKit) {
      throw ErrorFactory.Conflict(
        `«${product.name}» es un kit y no puede ser variante de un grupo.`,
        { productId: product.id, reason: "kit" },
      );
    }
    // Un producto suelto archivado no se adopta (se republicaría sin querer);
    // una variante que ya está en el grupo sí puede seguir archivada.
    if (product.isArchived && product.productGroupId !== groupId) {
      throw ErrorFactory.Conflict(
        `«${product.name}» está archivado. Restáuralo antes de traerlo al grupo.`,
        { productId: product.id, reason: "archived" },
      );
    }
  }

  return byId;
}

export interface VariantRemoval {
  id: string;
  name: string;
  sku: string | null;
  /** Con bloqueos se archiva y conserva su historial; libre se elimina. */
  action: "archive" | "delete";
  blockers: ProductDeleteBlocker[];
}

/**
 * Qué pasa con cada variante que sale del grupo: la misma revisión que
 * «Eliminar» en la ficha (pedidos, kits, Mercado Libre, ferias, reposición,
 * preventa, kardex), no solo pedidos. Antes un kit o una publicación hacían
 * fallar todo el guardado con un 400 sin nombre y el kardex se borraba en
 * cascada.
 */
export async function resolveVariantRemovals(
  db: Pick<Prisma.TransactionClient, "product">,
  {
    storeId,
    products,
  }: {
    storeId: string;
    products: { id: string; name: string; sku: string | null }[];
  },
): Promise<VariantRemoval[]> {
  const removals: VariantRemoval[] = [];
  for (const product of products) {
    const check = await getProductDeleteCheck(db, {
      storeId,
      productId: product.id,
    });
    const blockers = check?.blockers ?? [];
    removals.push({
      id: product.id,
      name: product.name,
      sku: product.sku,
      action: blockers.length > 0 ? "archive" : "delete",
      blockers,
    });
  }
  return removals;
}

export function describeRemovals(removals: VariantRemoval[]) {
  return removals
    .map((removal) =>
      removal.action === "archive"
        ? `«${removal.name}» se archiva (${removal.blockers.map((blocker) => blocker.label.toLowerCase()).join(", ")})`
        : `«${removal.name}» se elimina`,
    )
    .join("; ");
}

const toNumber = (value: number | string | null | undefined) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(parsed)) {
    throw ErrorFactory.InvalidRequest(`«${value}» no es un número válido.`);
  }
  return parsed;
};

/**
 * Datos que se escriben en una variante. Para una fila nueva, lo que falte
 * lo aporta el grupo; para una existente o adoptada, lo que falte NO se
 * toca (`undefined` = Prisma lo ignora).
 */
export function buildVariantData({
  variant,
  defaults,
  isNew,
  attributes,
}: {
  variant: VariantPayload;
  defaults: GroupDefaults;
  isNew: boolean;
  attributes: { sizeId: string; colorId: string; designId: string };
}) {
  const provided = <T>(value: T | undefined, fallback: T | undefined) =>
    value !== undefined ? value : isNew ? fallback : undefined;

  const price = provided(toNumber(variant.price), toNumber(defaults.price) ?? 0);
  const acqPrice = provided(
    toNumber(variant.acqPrice),
    toNumber(defaults.acqPrice) ?? null,
  );
  const description = provided(
    variant.description !== undefined
      ? sanitizeRichTextHtml(variant.description)
      : undefined,
    defaults.description,
  );
  const supplierId = provided(
    variant.supplierId !== undefined ? variant.supplierId || null : undefined,
    defaults.supplierId || null,
  );

  const identifiersTouched =
    variant.gtin !== undefined ||
    variant.mpn !== undefined ||
    variant.hasNoProductIdentifier !== undefined;
  let identifiers: ReturnType<typeof normalizeProductIdentifiers> | undefined;
  if (isNew || identifiersTouched) {
    try {
      identifiers = normalizeProductIdentifiers({
        gtin: variant.gtin,
        mpn: variant.mpn,
        hasNoProductIdentifier: variant.hasNoProductIdentifier,
        defaultNoIdentifierWhenEmpty: true,
      });
    } catch (error) {
      throw ErrorFactory.InvalidRequest(
        `La variante «${variantLabel(variant)}»: ${
          error instanceof Error ? error.message : "identificadores inválidos"
        }`,
      );
    }
  }

  return {
    ...attributes,
    ...(defaults.categoryId ? { categoryId: defaults.categoryId } : {}),
    name: provided(variant.name || undefined, defaults.name),
    description,
    price,
    acqPrice,
    supplierId,
    isFeatured: provided(variant.isFeatured, defaults.isFeatured ?? false),
    // La casilla «todas archivadas / todas a la venta» del grupo manda solo
    // cuando el formulario la eligió; si no viene, cada variante decide.
    isArchived:
      typeof defaults.isArchived === "boolean"
        ? defaults.isArchived
        : provided(variant.isArchived, false),
    ...(identifiers ?? {}),
    ...(variant.sku ? { sku: variant.sku } : {}),
  };
}

/** Ids que pasan de «a la venta» a «archivada» en este guardado. */
export function collectArchiveTransitions(
  previous: { id: string; isArchived: boolean }[],
  next: Map<string, boolean | undefined>,
) {
  return previous
    .filter((product) => !product.isArchived && next.get(product.id) === true)
    .map((product) => product.id);
}
