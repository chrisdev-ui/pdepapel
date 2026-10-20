/**
 * El recibo (`/pedido/<id>`) se abre con el id como llave: ninguna medición
 * puede llevarlo. GA4 y Vercel reciben `/pedido/[id]`, solo con los `utm_*`
 * de la URL (nada de `?id=` de Wompi ni `bold-*`), y el título sin número de
 * pedido. El resto de la tienda no cambia.
 */
const ORDER_RECEIPT_PATH = /^\/(?:pedido|order)\/[^/]+\/?$/;

/** La vista previa de una edición de cápsulas: el enlace firmado nunca sale en una medición. */
const CAPSULE_PATH = /^\/capsulas\//;
const CAPSULE_PREVIEW_PARAM = "vista";

export const REDACTED_ORDER_PATH = "/pedido/[id]";
export const REDACTED_ORDER_TITLE = "Tu pedido | Papelería P de Papel";

export function isOrderReceiptPath(pathname: string): boolean {
  return ORDER_RECEIPT_PATH.test(pathname);
}

export function redactAnalyticsPath(pathname: string): string {
  return isOrderReceiptPath(pathname) ? REDACTED_ORDER_PATH : pathname;
}

/** Una URL absoluta (o relativa a `base`) tal como la puede ver una herramienta de analítica. */
export function redactAnalyticsUrl(url: string, base = "https://papeleriapdepapel.com"): string {
  let parsed: URL;
  try {
    parsed = new URL(url, base);
  } catch {
    return url;
  }
  if (CAPSULE_PATH.test(parsed.pathname) && parsed.searchParams.has(CAPSULE_PREVIEW_PARAM)) {
    parsed.searchParams.delete(CAPSULE_PREVIEW_PARAM);
    return parsed.toString();
  }
  if (!isOrderReceiptPath(parsed.pathname)) return url;

  const kept = new URLSearchParams();
  parsed.searchParams.forEach((value, key) => {
    if (key.toLowerCase().startsWith("utm_")) kept.append(key, value);
  });
  const query = kept.toString();
  return `${parsed.origin}${REDACTED_ORDER_PATH}${query ? `?${query}` : ""}`;
}

export function redactAnalyticsTitle(pathname: string, title: string): string {
  return isOrderReceiptPath(pathname) ? REDACTED_ORDER_TITLE : title;
}
