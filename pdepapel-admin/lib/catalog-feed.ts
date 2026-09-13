import { createHmac, timingSafeEqual } from "node:crypto";

import { Redis } from "@upstash/redis";

/**
 * Primitivas compartidas por los feeds de catálogo hospedados (Google Merchant
 * y el catálogo de Meta). Cada feed define sus propias columnas y su propio
 * mapeo; aquí solo vive lo que es idéntico entre ellos: el token de acceso, la
 * limpieza de texto para TSV, la detección de grupos con variantes repetidas y
 * el cliente de Redis.
 */

// --- Token de acceso --------------------------------------------------------

/**
 * Los proveedores descargan el feed con una URL simple (o con autenticación
 * básica). El token es un HMAC del id de la tienda bajo un secreto del
 * servidor, así que la URL queda atada a la tienda, no se puede adivinar y
 * rota cambiando el secreto. Del token no se filtra nada del catálogo.
 *
 * `feedName` separa los dominios: el token de un feed nunca sirve para otro,
 * aunque compartieran secreto.
 */
export function createCatalogFeedToken(
  feedName: string,
  storeId: string,
  secret: string,
) {
  return createHmac("sha256", secret)
    .update(`${feedName}:${storeId}`)
    .digest("hex");
}

export function isCatalogFeedTokenValid(
  feedName: string,
  storeId: string,
  token: string | null | undefined,
  secret: string | null | undefined,
) {
  if (!token || !secret) return false;

  const expected = Buffer.from(createCatalogFeedToken(feedName, storeId, secret));
  const received = Buffer.from(token);

  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

/** Acepta `?token=`, `Authorization: Bearer <token>` o autenticación básica con el token como contraseña. */
export function extractCatalogFeedToken(request: Request) {
  const fromQuery = new URL(request.url).searchParams.get("token");
  if (fromQuery) return fromQuery.trim();

  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, value = ""] = authorization.split(" ", 2);

  if (scheme?.toLowerCase() === "bearer") return value.trim() || null;
  if (scheme?.toLowerCase() === "basic") {
    try {
      const decoded = Buffer.from(value, "base64").toString("utf8");
      const separator = decoded.indexOf(":");
      const password =
        separator === -1 ? decoded : decoded.slice(separator + 1);
      return password.trim() || null;
    } catch {
      return null;
    }
  }

  return null;
}

// --- Filas ------------------------------------------------------------------

/** Un tabulador o un salto de línea dentro de un campo rompería la fila. */
export function cleanFeedText(value: string | null | undefined) {
  return (value || "")
    .replace(/[\t\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type FeedVariantKeys = {
  productGroupId?: string | null;
  sizeId?: string | null;
  colorId?: string | null;
  designId?: string | null;
};

/**
 * Un grupo cuyas variantes repiten la misma combinación de talla, color y
 * diseño no se puede agrupar: el proveedor no sabría distinguirlas y rechaza
 * las repetidas. Esos grupos salen sin `item_group_id`.
 */
export function findGroupsWithDuplicateVariants(products: FeedVariantKeys[]) {
  const combinationsByGroup = new Map<string, Set<string>>();
  const duplicates = new Set<string>();

  for (const product of products) {
    if (!product.productGroupId) continue;

    const combination = [product.sizeId, product.colorId, product.designId].join(
      "|",
    );
    const combinations = combinationsByGroup.get(product.productGroupId);

    if (combinations?.has(combination)) {
      duplicates.add(product.productGroupId);
    } else if (combinations) {
      combinations.add(combination);
    } else {
      combinationsByGroup.set(product.productGroupId, new Set([combination]));
    }
  }

  return duplicates;
}

// --- Caché ------------------------------------------------------------------

/** `null` cuando Redis no está configurado: el feed se genera al vuelo. */
export function getFeedRedis(): Redis | null {
  try {
    return Redis.fromEnv();
  } catch {
    return null;
  }
}
