/** Línea «Rosa pastel · S» a partir de los atributos; vacía si no aportan nada. */
export function describeVariant(product: {
  color?: { name: string } | null;
  size?: { name: string } | null;
  design?: { name: string } | null;
}) {
  const parts = [product.color?.name, product.size?.name, product.design?.name]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .filter((value) => !/^(único|unica|única|unico|n\/a|na|-)$/i.test(value));
  return parts.length > 0 ? parts.join(" · ") : null;
}
