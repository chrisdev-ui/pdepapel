import type { Prisma } from "@prisma/client";

import {
  resolveVariantImages,
  type GroupPhoto,
  type ImageMappingEntry,
} from "@/lib/variant-images";

/**
 * Origen de las fotos de una variante: OWN, GROUP_COPY (las crea y borra el
 * reparto) o NULL (filas previas: cuentan como OWN y el reparto no las borra).
 *
 * Las galerías ordenan por portada, fecha e id, sin mirar el origen, así NULL
 * y OWN ordenan igual. Que las copias queden después de las propias lo
 * garantiza la escritura: las copias siempre son las filas más nuevas.
 */
type Tx = Pick<Prisma.TransactionClient, "image">;

export const GALLERY_ORDER = [
  { isMain: "desc" as const },
  { createdAt: "asc" as const },
  { id: "asc" as const },
];
const VISIBLE_ORDER = [{ createdAt: "asc" as const }, { id: "asc" as const }];

const staggered = (base: Date, index: number) => new Date(base.getTime() + index);

/** Una hora posterior a todas las filas de la variante (`createMany` repite la hora). */
async function afterNewest(tx: Tx, productId: string, now: Date) {
  const newest = await tx.image.findFirst({
    where: { productId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return newest && newest.createdAt >= now ? new Date(newest.createdAt.getTime() + 1) : now;
}

async function moveCopiesLast(tx: Tx, productId: string, base: Date) {
  const copies = await tx.image.findMany({
    where: { productId, origin: "GROUP_COPY" },
    orderBy: VISIBLE_ORDER,
    select: { id: true },
  });
  for (let index = 0; index < copies.length; index += 1) {
    await tx.image.update({ where: { id: copies[index].id }, data: { createdAt: staggered(base, index) } });
  }
}

export async function writeGroupPhotos(
  tx: Tx,
  {
    productGroupId,
    images,
    imageMapping,
    now = new Date(),
  }: {
    productGroupId: string;
    images: { url: string; isMain?: boolean }[];
    imageMapping?: ImageMappingEntry[] | null;
    now?: Date;
  },
) {
  await tx.image.deleteMany({ where: { productGroupId } });
  if (images.length === 0) return;
  await tx.image.createMany({
    data: images.map((image, index) => ({
      url: image.url,
      isMain: image.isMain ?? false,
      productGroupId,
      scope: imageMapping?.find((entry) => entry.url === image.url)?.scope ?? null,
      createdAt: staggered(now, index),
    })),
  });
}

/**
 * `ownUrls`: las propias que manda el formulario; `undefined` las deja como
 * están. Una propia solo se borra si el formulario deja de mandarla.
 */
export async function syncVariantGallery(
  tx: Tx,
  {
    productId,
    ownUrls,
    groupPhotos,
    imageMapping,
    colorId,
    designId,
    now = new Date(),
  }: {
    productId: string;
    ownUrls?: (string | { url: string; isMain?: boolean })[] | null;
    groupPhotos: GroupPhoto[];
    imageMapping?: ImageMappingEntry[] | null;
    colorId?: string | null;
    designId?: string | null;
    now?: Date;
  },
) {
  const existing = await tx.image.findMany({
    where: { productId },
    orderBy: VISIBLE_ORDER,
    select: { id: true, url: true, isMain: true, origin: true },
  });
  const base = await afterNewest(tx, productId, now);
  const existingOwn = existing.filter((row) => row.origin !== "GROUP_COPY");
  const existingCopies = existing.filter((row) => row.origin === "GROUP_COPY");

  const requested = (ownUrls ?? []).map((image) =>
    typeof image === "string" ? { url: image.trim(), isMain: false } : { url: image.url.trim(), isMain: Boolean(image.isMain) },
  );
  let ownList: string[];
  if (ownUrls == null) {
    ownList = existingOwn.map((row) => row.url);
  } else {
    const wanted = Array.from(new Set(requested.map((image) => image.url).filter(Boolean)));
    const kept = existingOwn.map((row) => row.url).filter((url) => wanted.includes(url));
    ownList = [...kept, ...wanted.filter((url) => !kept.includes(url))];
  }

  const plan = resolveVariantImages({
    variantImages: ownList.map((url) => ({
      url,
      isMain:
        requested.find((image) => image.url === url)?.isMain ||
        (existingOwn.find((row) => row.url === url)?.isMain ?? false),
    })),
    groupImages: groupPhotos,
    imageMapping,
    colorId,
    designId,
    currentCoverUrl: existing.find((row) => row.isMain)?.url ?? null,
  });
  const coverUrl = plan.find((image) => image.isMain)?.url ?? null;
  const ownSet = new Set(ownList);

  const removedOwn = existingOwn.filter((row) => !ownSet.has(row.url));
  if (removedOwn.length > 0) {
    await tx.image.deleteMany({ where: { id: { in: removedOwn.map((row) => row.id) } } });
  }

  // Una copia elegida como propia cambia de origen en vez de duplicarse.
  const promoted = existingCopies.filter((row) => ownSet.has(row.url));
  const promotedUrls = new Set<string>();
  for (const row of promoted) {
    if (promotedUrls.has(row.url)) continue;
    promotedUrls.add(row.url);
    await tx.image.update({ where: { id: row.id }, data: { origin: "OWN" } });
  }

  const existingUrls = new Set(existingOwn.map((row) => row.url));
  const newOwn = ownList.filter((url) => !existingUrls.has(url) && !promotedUrls.has(url));
  if (newOwn.length > 0) {
    await tx.image.createMany({
      data: newOwn.map((url, index) => ({
        url,
        productId,
        origin: "OWN" as const,
        isMain: false,
        createdAt: staggered(base, index),
      })),
    });
  }

  const promotedIds = new Set(promoted.map((row) => row.id));
  const staleCopies = existingCopies.filter((row) => !promotedIds.has(row.id));
  if (staleCopies.length > 0) {
    await tx.image.deleteMany({ where: { id: { in: staleCopies.map((row) => row.id) } } });
  }
  const copies = plan.filter((image) => image.fromGroup);
  if (copies.length > 0) {
    await tx.image.createMany({
      data: copies.map((image, index) => ({
        url: image.url,
        productId,
        origin: "GROUP_COPY" as const,
        isMain: image.url === coverUrl,
        createdAt: staggered(base, newOwn.length + index),
      })),
    });
  }

  // `origin <> 'GROUP_COPY'` deja fuera las filas NULL en SQL.
  await tx.image.updateMany({
    where: {
      productId,
      isMain: true,
      OR: [{ origin: null }, { origin: "OWN" }],
      ...(coverUrl ? { NOT: { url: coverUrl } } : {}),
    },
    data: { isMain: false },
  });
  if (coverUrl && !copies.some((image) => image.url === coverUrl)) {
    const coverRow = await tx.image.findFirst({
      where: { productId, url: coverUrl },
      orderBy: VISIBLE_ORDER,
      select: { id: true },
    });
    if (coverRow) await tx.image.update({ where: { id: coverRow.id }, data: { isMain: true } });
  }

  return plan;
}

/** Al salir del grupo la variante conserva su galería: las copias pasan a propias. */
export async function releaseGroupCopies(tx: Tx, productIds: string[]) {
  if (productIds.length === 0) return;
  await tx.image.updateMany({
    where: { productId: { in: productIds }, origin: "GROUP_COPY" },
    data: { origin: "OWN" },
  });
}

/**
 * Guardado de la ficha de un producto: maneja sus fotos propias y la portada.
 * Las copias del grupo se conservan aunque la ficha no las mande.
 */
export async function replaceOwnPhotos(
  tx: Tx,
  {
    productId,
    images,
    now = new Date(),
  }: {
    productId: string;
    images: { url: string; isMain?: boolean }[];
    now?: Date;
  },
) {
  const existing = await tx.image.findMany({
    where: { productId },
    orderBy: VISIBLE_ORDER,
    select: { id: true, url: true, origin: true },
  });
  const base = await afterNewest(tx, productId, now);
  const copyUrls = new Set(existing.filter((row) => row.origin === "GROUP_COPY").map((row) => row.url));
  const wanted = Array.from(
    new Set(images.map((image) => image.url.trim()).filter((url) => url && !copyUrls.has(url))),
  );
  const own = existing.filter((row) => row.origin !== "GROUP_COPY");

  const removed = own.filter((row) => !wanted.includes(row.url));
  if (removed.length > 0) {
    await tx.image.deleteMany({ where: { id: { in: removed.map((row) => row.id) } } });
  }
  const ownUrls = new Set(own.map((row) => row.url));
  const added = wanted.filter((url) => !ownUrls.has(url));
  if (added.length > 0) {
    await tx.image.createMany({
      data: added.map((url, index) => ({
        url,
        productId,
        origin: "OWN" as const,
        isMain: false,
        createdAt: staggered(base, index),
      })),
    });
    await moveCopiesLast(tx, productId, staggered(base, added.length));
  }

  const requestedCover = images.find((image) => image.isMain)?.url.trim();
  const rows = await tx.image.findMany({
    where: { productId },
    orderBy: VISIBLE_ORDER,
    select: { id: true, url: true },
  });
  const cover = rows.find((row) => row.url === requestedCover) ?? rows[0];
  await tx.image.updateMany({ where: { productId }, data: { isMain: false } });
  if (cover) await tx.image.update({ where: { id: cover.id }, data: { isMain: true } });
}

/**
 * Cambio de grupo desde la ficha: se van las copias del grupo anterior y se
 * aplica el reparto del nuevo. Si eso dejara la variante sin fotos, las
 * copias anteriores se quedan como propias.
 */
export async function switchVariantGroup(
  tx: Tx,
  {
    productId,
    images,
    groupPhotos,
    colorId,
    designId,
    now = new Date(),
  }: {
    productId: string;
    images: { url: string; isMain?: boolean }[];
    groupPhotos: GroupPhoto[];
    colorId?: string | null;
    designId?: string | null;
    now?: Date;
  },
) {
  const oldCopies = await tx.image.findMany({
    where: { productId, origin: "GROUP_COPY" },
    select: { id: true, url: true },
  });
  const oldCopyUrls = new Set(oldCopies.map((row) => row.url));
  const ownImages = images.filter((image) => !oldCopyUrls.has(image.url.trim()));
  const planned = resolveVariantImages({ variantImages: ownImages, groupImages: groupPhotos, colorId, designId });

  if (planned.length === 0) {
    await releaseGroupCopies(tx, [productId]);
    await replaceOwnPhotos(tx, { productId, images, now });
    return;
  }
  if (oldCopies.length > 0) {
    await tx.image.deleteMany({ where: { id: { in: oldCopies.map((row) => row.id) } } });
  }
  await replaceOwnPhotos(tx, { productId, images: ownImages, now });
  await syncVariantGallery(tx, { productId, groupPhotos, colorId, designId, now });
}
