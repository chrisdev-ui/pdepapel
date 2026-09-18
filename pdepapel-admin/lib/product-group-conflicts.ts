import type { Prisma, PrismaClient } from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";
import {
  imageUrlKey,
  resolveVariantImages,
  type ImageMappingEntry,
} from "@/lib/variant-images";

type Client = PrismaClient | Prisma.TransactionClient;

export const STANDALONE_PRODUCT_EXISTS = "STANDALONE_PRODUCT_EXISTS";

export type StandaloneConflictReason = "name" | "images";

export interface StandaloneConflict {
  id: string;
  name: string;
  sku: string | null;
  reason: StandaloneConflictReason;
  /** Nombre de la variante del payload que chocó. */
  variant: string;
}

interface VariantLike {
  id?: string | null;
  name?: string | null;
  images?: (string | { url: string })[] | null;
  colorId?: string | null;
  designId?: string | null;
  color?: { id?: string | null } | null;
  design?: { id?: string | null } | null;
}

interface GroupImageContext {
  images?: { url: string; isMain?: boolean }[] | null;
  imageMapping?: ImageMappingEntry[] | null;
}

const normalize = (value: string) => value.trim().toLowerCase();

/**
 * Una variante sin `id` se crea desde cero. Si ya hay un producto suelto con
 * ese mismo nombre en la tienda, crearla duplica el producto y deja el
 * inventario en el viejo: hay que adoptarlo desde «Importar productos
 * existentes». Devuelve los choques, ignorando los productos que el mismo
 * payload ya adopta por id.
 */
export async function findStandaloneNameConflicts(
  client: Client,
  storeId: string,
  variants: VariantLike[],
  fallbackName: string,
): Promise<StandaloneConflict[]> {
  const adopted = new Set(variants.map((v) => v.id).filter(Boolean));
  const wanted = new Map<string, string>();
  for (const variant of variants) {
    if (variant.id) continue;
    const name = (variant.name || fallbackName || "").trim();
    if (name) wanted.set(normalize(name), name);
  }
  if (wanted.size === 0) return [];

  const candidates = await client.product.findMany({
    where: {
      storeId,
      productGroupId: null,
      name: { in: Array.from(wanted.values()) },
    },
    select: { id: true, name: true, sku: true },
  });

  return candidates
    .filter(
      (product) =>
        !adopted.has(product.id) && wanted.has(normalize(product.name)),
    )
    .map((product) => ({
      ...product,
      reason: "name" as const,
      variant: wanted.get(normalize(product.name)) ?? product.name,
    }));
}

/**
 * El caso real de «cartuchera lucky girls»: la variante generada se llamaba
 * distinto pero llevaba exactamente las mismas fotos que el producto suelto.
 * Compara el juego completo de URLs de cada variante nueva con el de los
 * productos sueltos que usan alguna de esas URLs.
 */
export async function findStandaloneImageConflicts(
  client: Client,
  storeId: string,
  variants: VariantLike[],
  fallbackName: string,
  context: GroupImageContext,
): Promise<StandaloneConflict[]> {
  const adopted = new Set(variants.map((v) => v.id).filter(Boolean));
  const wanted = new Map<string, string>();
  for (const variant of variants) {
    if (variant.id) continue;
    const urls = resolveVariantImages({
      variantImages: variant.images,
      groupImages: context.images ?? [],
      imageMapping: context.imageMapping,
      colorId: variant.color?.id || variant.colorId,
      designId: variant.design?.id || variant.designId,
    }).map((image) => image.url);
    if (urls.length === 0) continue;
    wanted.set(
      imageUrlKey(urls),
      (variant.name || fallbackName || "").trim() || "variante",
    );
  }
  if (wanted.size === 0) return [];

  const urls = Array.from(
    new Set(Array.from(wanted.keys()).flatMap((key) => key.split("\n"))),
  );
  const candidates = await client.product.findMany({
    where: {
      storeId,
      productGroupId: null,
      images: { some: { url: { in: urls } } },
    },
    select: {
      id: true,
      name: true,
      sku: true,
      images: { select: { url: true } },
    },
  });

  const conflicts: StandaloneConflict[] = [];
  for (const product of candidates) {
    if (adopted.has(product.id)) continue;
    const key = imageUrlKey(product.images.map((image) => image.url));
    const variant = wanted.get(key);
    if (variant) {
      conflicts.push({
        id: product.id,
        name: product.name,
        sku: product.sku,
        reason: "images",
        variant,
      });
    }
  }
  return conflicts;
}

function describe(conflicts: StandaloneConflict[]): string {
  const byReason = (reason: StandaloneConflictReason) =>
    conflicts.filter((c) => c.reason === reason).map((c) => `«${c.name}»`);
  const parts: string[] = [];
  const names = byReason("name");
  const images = byReason("images");
  if (names.length) {
    parts.push(
      names.length === 1
        ? `Ya existe un producto suelto llamado ${names[0]}.`
        : `Ya existen productos sueltos llamados ${names.join(", ")}.`,
    );
  }
  if (images.length) {
    parts.push(
      images.length === 1
        ? `${images[0]} ya existe suelto con exactamente las mismas fotos.`
        : `${images.join(", ")} ya existen sueltos con exactamente las mismas fotos.`,
    );
  }
  parts.push(
    "Impórtalos con «Importar productos existentes» en vez de crear otros nuevos.",
  );
  return parts.join(" ");
}

/** Las dos comprobaciones a la vez: nombre e imágenes. */
export async function assertNoStandaloneConflicts(
  client: Client,
  storeId: string,
  variants: VariantLike[],
  fallbackName: string,
  context: GroupImageContext = {},
): Promise<void> {
  const [byName, byImages] = await Promise.all([
    findStandaloneNameConflicts(client, storeId, variants, fallbackName),
    findStandaloneImageConflicts(
      client,
      storeId,
      variants,
      fallbackName,
      context,
    ),
  ]);
  const seen = new Set<string>();
  const conflicts = [...byName, ...byImages].filter((c) => {
    const key = `${c.id}|${c.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (conflicts.length === 0) return;
  throw ErrorFactory.Conflict(describe(conflicts), {
    code: STANDALONE_PRODUCT_EXISTS,
    conflicts,
  });
}

/** Compatibilidad: sólo el nombre. */
export async function assertNoStandaloneNameConflicts(
  client: Client,
  storeId: string,
  variants: VariantLike[],
  fallbackName: string,
): Promise<void> {
  const conflicts = await findStandaloneNameConflicts(
    client,
    storeId,
    variants,
    fallbackName,
  );
  if (conflicts.length === 0) return;
  throw ErrorFactory.Conflict(describe(conflicts), {
    code: STANDALONE_PRODUCT_EXISTS,
    conflicts,
  });
}
