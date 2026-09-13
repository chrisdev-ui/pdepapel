import {
  cleanFeedText,
  createCatalogFeedToken,
  extractCatalogFeedToken,
  findGroupsWithDuplicateVariants,
  getFeedRedis,
  isCatalogFeedTokenValid,
} from "@/lib/catalog-feed";
import {
  getGoogleMerchantColor,
  getGoogleMerchantDescription,
  getGoogleMerchantPattern,
  getGoogleMerchantProductLink,
  getGoogleMerchantSize,
  toGoogleMerchantImageUrl,
} from "@/lib/google-merchant";
import {
  getGoogleMerchantFeedProductArgs,
  type GoogleMerchantFeedProduct,
} from "@/lib/google-merchant-feed";
import prismadb from "@/lib/prismadb";

/**
 * Feed hospedado para el catálogo de Meta (Commerce Manager), que es el que
 * alimenta el catálogo de WhatsApp, las etiquetas de Instagram y la tienda de
 * Facebook.
 *
 * Es un feed APARTE del de Google Merchant a propósito: las especificaciones
 * no coinciden y reutilizar el de Google tal cual hace que Meta rechace todos
 * los productos. La diferencia que más duele es `availability`, que en Meta se
 * escribe con espacio (`in stock`), no con guion bajo.
 *
 * Lo que sí se comparte con el feed de Google, porque es idéntico:
 * - qué productos entran (no archivados y disponibles);
 * - el enlace, las imágenes (Cloudinary reescrito a PNG, que Meta también
 *   exige) y la descripción en texto plano;
 * - la regla de `identifier_exists` y la de `item_group_id`.
 *
 * Nada de esto escribe en el catálogo: el feed solo lee productos.
 */

/**
 * Orden de columnas del feed. Meta lee por nombre de encabezado, así que el
 * orden es solo legibilidad.
 *
 * Campos que se dejan fuera a propósito, no por olvido: la compra se cierra
 * conversando por WhatsApp, no con el pago nativo de Facebook o Instagram, así
 * que `quantity_to_sell_on_facebook` (obligatorio solo con pago en la
 * plataforma), `visibility`/`status` y `fb_product_category` no aplican. El
 * inventario real ya viaja en `availability`.
 */
export const META_CATALOG_FEED_HEADERS = [
  "id",
  "title",
  "description",
  "availability",
  "condition",
  "price",
  "link",
  "image_link",
  "additional_image_link",
  "brand",
  "gtin",
  "mpn",
  "identifier_exists",
  "item_group_id",
  "product_type",
  "color",
  "size",
  "pattern",
] as const;

export const META_CATALOG_FEED_NAME = "meta-catalog-feed";
export const META_CATALOG_FEED_FILENAME = "meta-catalog-feed.txt";
export const META_CATALOG_FEED_CONTENT_TYPE =
  "text/tab-separated-values; charset=utf-8";
/**
 * Sin trabajo programado detrás: Meta descarga el archivo cada día (o cada
 * hora) y la primera descarga después de que vence la caché reconstruye el
 * feed. Doce horas mantienen el catálogo fresco sin reconstruirlo en cada
 * descarga.
 */
export const META_CATALOG_FEED_CACHE_TTL_SECONDS = 60 * 60 * 12;

export const META_CATALOG_FEED_SCHEDULE_LABEL =
  "Se reconstruye solo, en la primera descarga de Meta después de 12 horas";

/** Meta corta el título en 200 caracteres y rechaza el producto si se pasa. */
export const META_CATALOG_TITLE_MAX_LENGTH = 200;

/** La elegibilidad es deliberadamente la misma que la del feed de Google. */
export type MetaCatalogFeedProduct = GoogleMerchantFeedProduct;
export const getMetaCatalogFeedProductArgs = getGoogleMerchantFeedProductArgs;

export type MetaCatalogFeedReport = {
  generatedAt: string;
  activeProducts: number;
  exportedProducts: number;
  outOfStock: number;
  withoutIdentifier: number;
  missingImages: Array<{ id: string; productId: string; name: string }>;
  groupsWithDuplicateVariants: string[];
};

export type MetaCatalogFeed = {
  tsv: string;
  report: MetaCatalogFeedReport;
};

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength).trimEnd() : value;
}

/**
 * Construye el TSV y un informe de lo que quedó fuera o se ajustó. Con `links`
 * solo se exportan los productos presentes en el mapa y el enlace se toma de
 * ahí; si no, se usa el enlace canónico de la tienda.
 */
export function buildMetaCatalogFeed(
  products: MetaCatalogFeedProduct[],
  options: { links?: Map<string, string>; generatedAt?: Date } = {},
): MetaCatalogFeed {
  const generatedAt = options.generatedAt ?? new Date();
  const groupsWithDuplicateVariants = findGroupsWithDuplicateVariants(products);
  const exported = options.links
    ? products.filter((product) => options.links!.has(product.id))
    : products;

  const missingImages: MetaCatalogFeedReport["missingImages"] = [];
  let outOfStock = 0;
  let withoutIdentifier = 0;

  const rows = exported.map((product) => {
    const feedId = product.sku || product.id;
    const mainImage = product.images.find((image) => image.isMain);
    const rawMainImage = mainImage?.url || product.images[0]?.url || "";
    const imageLink = toGoogleMerchantImageUrl(rawMainImage);
    const additionalImages = product.images
      .filter((image) => image.url !== rawMainImage)
      .slice(0, 10)
      .map((image) => toGoogleMerchantImageUrl(image.url));

    if (!rawMainImage) {
      missingImages.push({
        id: feedId,
        productId: product.id,
        name: product.name,
      });
    }

    const brand = product.brand || product.productGroup?.brand || "";
    const productType = [product.category?.type?.name, product.category?.name]
      .filter(Boolean)
      .join(" > ");
    const identifierExists =
      product.hasNoProductIdentifier || (!product.gtin && !(brand && product.mpn))
        ? "no"
        : "";
    if (identifierExists === "no") withoutIdentifier += 1;
    // Con espacio, no con guion bajo: es la diferencia que rechaza el catálogo
    // entero si se copia el feed de Google tal cual.
    const availability = product.stock > 0 ? "in stock" : "out of stock";
    if (availability === "out of stock") outOfStock += 1;
    const itemGroupId =
      product.productGroupId &&
      !groupsWithDuplicateVariants.has(product.productGroupId)
        ? product.productGroupId
        : "";

    return [
      feedId,
      truncate(cleanFeedText(product.name), META_CATALOG_TITLE_MAX_LENGTH),
      cleanFeedText(
        getGoogleMerchantDescription(product.description, product.name),
      ),
      availability,
      "new",
      // Número, espacio y código ISO 4217. Punto decimal y sin separador de
      // miles: "15000.00 COP".
      `${product.price.toFixed(2)} COP`,
      options.links?.get(product.id) ?? getGoogleMerchantProductLink(product),
      imageLink,
      additionalImages.join(","),
      cleanFeedText(brand),
      product.gtin || "",
      product.mpn || "",
      identifierExists,
      itemGroupId,
      cleanFeedText(productType),
      cleanFeedText(getGoogleMerchantColor(product.name, product.color)),
      cleanFeedText(getGoogleMerchantSize(product.category?.name, product.size)),
      cleanFeedText(getGoogleMerchantPattern(product.name, product.design)),
    ].join("\t");
  });

  return {
    tsv: `${META_CATALOG_FEED_HEADERS.join("\t")}\n${rows.join("\n")}${rows.length ? "\n" : ""}`,
    report: {
      generatedAt: generatedAt.toISOString(),
      activeProducts: products.length,
      exportedProducts: exported.length,
      outOfStock,
      withoutIdentifier,
      missingImages,
      groupsWithDuplicateVariants: Array.from(groupsWithDuplicateVariants),
    },
  };
}

// --- Token de acceso --------------------------------------------------------

export function createMetaCatalogFeedToken(storeId: string, secret: string) {
  return createCatalogFeedToken(META_CATALOG_FEED_NAME, storeId, secret);
}

export function isMetaCatalogFeedTokenValid(
  storeId: string,
  token: string | null | undefined,
  secret: string | null | undefined,
) {
  return isCatalogFeedTokenValid(META_CATALOG_FEED_NAME, storeId, token, secret);
}

/** Acepta `?token=`, `Authorization: Bearer <token>` o autenticación básica con el token como contraseña. */
export const extractMetaCatalogFeedToken = extractCatalogFeedToken;

export function getMetaCatalogFeedUrl(
  storeId: string,
  secret: string,
  baseUrl: string,
) {
  const url = new URL(
    `/api/${encodeURIComponent(storeId)}/meta-catalog/feed`,
    baseUrl,
  );
  url.searchParams.set("token", createMetaCatalogFeedToken(storeId, secret));
  return url.toString();
}

// --- Caché ------------------------------------------------------------------

export function getMetaCatalogFeedCacheKeys(storeId: string) {
  return {
    feed: `store:${storeId}:meta-catalog:feed`,
    report: `store:${storeId}:meta-catalog:report`,
  };
}

export async function readCachedMetaCatalogFeed(
  storeId: string,
): Promise<MetaCatalogFeed | null> {
  const redis = getFeedRedis();
  if (!redis) return null;

  try {
    const keys = getMetaCatalogFeedCacheKeys(storeId);
    const [tsv, report] = await Promise.all([
      redis.get<string>(keys.feed),
      redis.get<MetaCatalogFeedReport | string>(keys.report),
    ]);
    if (typeof tsv !== "string" || !report) return null;

    return {
      tsv,
      report: typeof report === "string" ? JSON.parse(report) : report,
    };
  } catch (error) {
    console.error(`Meta catalog feed cache read failed for ${storeId}:`, error);
    return null;
  }
}

async function writeCachedMetaCatalogFeed(
  storeId: string,
  feed: MetaCatalogFeed,
) {
  const redis = getFeedRedis();
  if (!redis) return false;

  try {
    const keys = getMetaCatalogFeedCacheKeys(storeId);
    await Promise.all([
      redis.set(keys.feed, feed.tsv, {
        ex: META_CATALOG_FEED_CACHE_TTL_SECONDS,
      }),
      redis.set(keys.report, JSON.stringify(feed.report), {
        ex: META_CATALOG_FEED_CACHE_TTL_SECONDS,
      }),
    ]);
    return true;
  } catch (error) {
    console.error(`Meta catalog feed cache write failed for ${storeId}:`, error);
    return false;
  }
}

/** Lee el catálogo, reconstruye el feed y lo guarda. Nunca modifica productos. */
export async function refreshMetaCatalogFeed(
  storeId: string,
): Promise<MetaCatalogFeed & { cached: boolean }> {
  const products = await prismadb.product.findMany(
    getMetaCatalogFeedProductArgs(storeId),
  );
  const feed = buildMetaCatalogFeed(products);
  const cached = await writeCachedMetaCatalogFeed(storeId, feed);

  return { ...feed, cached };
}

/** Sirve lo último construido y solo genera cuando no hay nada en caché. */
export async function resolveMetaCatalogFeed(
  storeId: string,
): Promise<MetaCatalogFeed> {
  return (
    (await readCachedMetaCatalogFeed(storeId)) ??
    (await refreshMetaCatalogFeed(storeId))
  );
}
