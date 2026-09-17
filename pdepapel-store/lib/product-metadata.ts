import { BASE_URL } from "@/constants";
import { getStructuredProductSize } from "@/lib/product-options";
import { productPath } from "@/lib/routes";
import { Product } from "@/types";

export function buildProductMetaTitle(product: Product) {
  const variantAttributes = [
    product.design?.name,
    product.color?.name,
    getStructuredProductSize(product),
  ]
    .filter(Boolean)
    .join(", ");

  return variantAttributes
    ? `${product.name} - ${variantAttributes}`
    : product.name;
}

export function buildProductCanonicalUrl(product: Product) {
  return `${BASE_URL}${productPath(product.slug || product.id)}`;
}

/**
 * Cambiar de variante reescribe la URL con `history.pushState`, así que Next
 * nunca vuelve a resolver `generateMetadata`. Sin esto el título y el canónico
 * se quedan en la variante anterior, y el `page_view` de GA4 —que lee
 * `document.title`— reporta la página equivocada.
 */
export function syncProductDocumentMetadata(product: Product) {
  if (typeof document === "undefined") return;

  const title = buildProductMetaTitle(product);
  const url = buildProductCanonicalUrl(product);

  document.title = title;
  setAttribute('meta[property="og:title"]', "content", title);
  setAttribute('meta[name="twitter:title"]', "content", title);
  setAttribute('meta[property="og:url"]', "content", url);
  setAttribute('link[rel="canonical"]', "href", url);
}

function setAttribute(selector: string, attribute: string, value: string) {
  document.querySelector(selector)?.setAttribute(attribute, value);
}
