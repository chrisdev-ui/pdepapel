/**
 * Qué subcategorías entran en un listado filtrado por tipo y/o subcategoría.
 * `undefined` = sin filtro; `[]` = nada coincide (un tipo o una subcategoría
 * que no existen ya no devuelven el catálogo entero). Una subcategoría
 * elegida reduce solo su propio tipo: los demás tipos elegidos se quedan con
 * todas las suyas.
 */
export function resolveCategoryScope({
  requestedCategoryIds,
  selectedCategories,
  typeRequested,
  typeCategories,
}: {
  requestedCategoryIds: string[];
  selectedCategories: { id: string; typeId: string }[];
  typeRequested: boolean;
  typeCategories: { id: string; typeId: string }[];
}): string[] | undefined {
  if (requestedCategoryIds.length === 0 && !typeRequested) return undefined;
  const narrowedTypes = new Set(selectedCategories.map((category) => category.typeId));
  const scope = new Set(selectedCategories.map((category) => category.id));
  for (const category of typeCategories) {
    if (!narrowedTypes.has(category.typeId)) scope.add(category.id);
  }
  return Array.from(scope);
}

/** Condición de Prisma para `categoryId`; un alcance vacío no coincide con nada. */
export function categoryScopeWhere(scope: string[] | undefined) {
  if (!scope) return undefined;
  return { in: scope.length > 0 ? scope : ["__NO_CATEGORY_MATCH__"] };
}
