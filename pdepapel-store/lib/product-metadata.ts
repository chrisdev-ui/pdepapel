import { BASE_URL } from "@/constants";
import { getStructuredProductSize } from "@/lib/product-options";
import { richTextToPlainText } from "@/lib/rich-text";
import { productPath } from "@/lib/routes";
import { Product } from "@/types";

type VariantAttributes = Pick<Product, "color" | "design"> &
  Partial<Pick<Product, "size" | "catalogOptionValues">>;

const BRAND_SUFFIX = " | P de Papel";
const TITLE_MAX_LENGTH = 60;
const DESCRIPTION_MAX_LENGTH = 160;

const normalize = (value: string) =>
  value.toLocaleLowerCase("es-CO").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const ATTRIBUTE_GETTERS: Array<(product: VariantAttributes) => string | null | undefined> = [
  (product) => product.design?.name,
  (product) => product.color?.name,
  (product) => getStructuredProductSize(product as Product),
];

/**
 * Solo lo que distingue a esta variante de sus hermanas, y solo si el nombre
 * no lo dice ya. Un producto suelto no lleva sufijo: «Block iris x35 hojas -
 * Clásico, Multicolor» repetía datos que no ayudan a nadie a elegir.
 */
export function getDistinguishingAttributes(product: Product, siblings: VariantAttributes[] = []) {
  if (siblings.length < 2) return [];
  const name = normalize(product.name);
  return ATTRIBUTE_GETTERS.filter((get) => new Set(siblings.map((sibling) => get(sibling) ?? "")).size > 1)
    .map((get) => get(product))
    .filter((value): value is string => Boolean(value) && !name.includes(normalize(value!)));
}

/** Título único por ficha: nombre, lo que distingue a la variante y la marca si cabe. */
export function buildProductMetaTitle(product: Product, siblings: VariantAttributes[] = []) {
  const attributes = getDistinguishingAttributes(product, siblings);
  const title = attributes.length ? `${product.name} - ${attributes.join(", ")}` : product.name;
  return `${title}${BRAND_SUFFIX}`.length <= TITLE_MAX_LENGTH ? `${title}${BRAND_SUFFIX}` : title;
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(price);

function truncate(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength - 1);
  const boundary = cut.lastIndexOf(" ");
  return `${cut.slice(0, boundary > 0 ? boundary : maxLength - 1).trimEnd()}…`;
}

/**
 * Descripción de la ficha. Con texto propio, ese texto (y delante lo que
 * distingue a la variante, para que las hermanas no compartan descripción).
 * Sin texto, precio y envío reales en vez del genérico «Descubre … en
 * Papelería P de Papel».
 */
export function buildProductMetaDescription(
  product: Product,
  options: { siblings?: VariantAttributes[]; freeShippingThreshold?: number | null } = {},
) {
  const attributes = getDistinguishingAttributes(product, options.siblings);
  const ownText = richTextToPlainText(product.description);
  if (ownText) {
    // En un grupo las hermanas suelen compartir el texto: algo propio de la
    // variante va delante (lo que la distingue o, si el nombre ya lo dice,
    // el nombre mismo) para que no publiquen la misma descripción.
    const isVariant = (options.siblings?.length ?? 0) > 1;
    const prefix = attributes.length
      ? `${attributes.join(", ")}. `
      : isVariant && !normalize(ownText).startsWith(normalize(product.name))
        ? `${product.name}. `
        : "";
    return truncate(`${prefix}${ownText}`, DESCRIPTION_MAX_LENGTH);
  }

  const label = attributes.length ? `${product.name} (${attributes.join(", ")})` : product.name;
  const shipping = options.freeShippingThreshold
    ? `Envío a toda Colombia, gratis desde ${formatPrice(options.freeShippingThreshold)}.`
    : "Envío a toda Colombia.";
  return truncate(
    `${label} por ${formatPrice(Number(product.price))} en Papelería P de Papel. ${shipping}`,
    DESCRIPTION_MAX_LENGTH,
  );
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
export function syncProductDocumentMetadata(product: Product, siblings: VariantAttributes[] = []) {
  if (typeof document === "undefined") return;

  const title = buildProductMetaTitle(product, siblings);
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
