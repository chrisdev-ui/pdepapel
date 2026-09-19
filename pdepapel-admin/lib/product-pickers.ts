/**
 * Reglas de elegibilidad de los dos selectores de producto que no usan el
 * buscador compartido: qué puede ser componente de un kit y qué producto
 * suelto puede traerse a un grupo. Viven aquí para que la lista del selector
 * y el escaneo (que pregunta por un id concreto) apliquen exactamente lo mismo.
 */

export interface SelectableWhereInput {
  storeId: string;
  /** Texto del buscador: nombre o categoría. */
  query?: string | null;
  /** El propio kit nunca es componente de sí mismo. */
  excludeId?: string | null;
  /** Un producto concreto (escaneo): solo se devuelve si cumple las mismas reglas. */
  id?: string | null;
}

/** Componentes de un kit: nunca otro kit, nunca archivados, nunca el propio kit. */
export function buildSelectableWhere({ storeId, query, excludeId, id }: SelectableWhereInput) {
  return {
    storeId,
    isArchived: false,
    isKit: false,
    ...(excludeId ? { NOT: { id: excludeId } } : {}),
    ...(id ? { id } : {}),
    OR: query
      ? [{ name: { contains: query } }, { category: { name: { contains: query } } }]
      : undefined,
  };
}

export interface IsolatedWhereInput {
  storeId: string;
  /** Texto del buscador: nombre, descripción o SKU. */
  query?: string | null;
  categoryId?: string | null;
  imageUrls?: string[];
  /** Un producto concreto (escaneo): solo se devuelve si sigue suelto y a la venta. */
  id?: string | null;
}

/** Productos que pueden traerse a un grupo: sueltos (sin grupo) y no archivados. */
export function buildIsolatedWhere({ storeId, query, categoryId, imageUrls = [], id }: IsolatedWhereInput) {
  const where: Record<string, unknown> = {
    storeId,
    productGroupId: null,
    isArchived: false,
  };
  if (id) where.id = id;
  if (query) {
    where.OR = [{ name: { contains: query } }, { description: { contains: query } }, { sku: { contains: query } }];
  }
  if (categoryId && categoryId !== "all") where.categoryId = categoryId;
  if (imageUrls.length > 0) where.images = { some: { url: { in: imageUrls } } };
  return where;
}
