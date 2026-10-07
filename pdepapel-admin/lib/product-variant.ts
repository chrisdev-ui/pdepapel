type VariantAttributes = {
  color?: { name: string } | null;
  size?: { name: string } | null;
  design?: { name: string } | null;
};

/** Color, talla y diseño que aportan algo («Único», «N/A» no). */
function variantParts(product: VariantAttributes) {
  return [product.color?.name, product.size?.name, product.design?.name]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .filter((value) => !/^(único|unica|única|unico|n\/a|na|-)$/i.test(value));
}

/** Línea «Rosa pastel · S» a partir de los atributos; vacía si no aportan nada. */
export function describeVariant(product: VariantAttributes) {
  const parts = variantParts(product);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Minúsculas y sin tildes, para comparar «Azul pastel» con «AZUL PASTEL». */
const normalizeForMatch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Como `describeVariant`, pero sin lo que el nombre ya dice: «Carpeta Flores
 * Azul pastel» con color Azul pastel y talla M da «M», no «Azul pastel · M».
 * Solo cuenta una coincidencia de palabras completas (la talla «S» no se
 * descarta por la «s» de «Carpetas»). Para mostrar junto al nombre; las
 * etiquetas impresas siguen usando `describeVariant`.
 */
export function describeVariantBeyondName(product: VariantAttributes & { name: string }) {
  const name = normalizeForMatch(product.name);
  const parts = variantParts(product).filter((part) => {
    const needle = normalizeForMatch(part);
    if (!needle) return false;
    return !new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(needle)}($|[^\\p{L}\\p{N}])`, "u").test(name);
  });
  return parts.length > 0 ? parts.join(" · ") : null;
}
