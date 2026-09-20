import { CAPSULAS_SORPRESA_ID } from "@/constants";

/**
 * Productos que NO son unidades sueltas de bodega.
 *
 * Dos clases, por dos razones distintas:
 *
 * - **Kits** (`isKit`): su `stock` no es una cuenta, es un cálculo
 *   (`recalculateKitStock` lo saca del mínimo de sus componentes). Contarlos
 *   como existencias sería contar dos veces el mismo producto físico.
 * - **Cápsulas sorpresa** (categoría «Kits sorpresa»): su stock sí es real,
 *   pero las unidades que contienen ya se descontaron de sus productos de
 *   origen al empacar el lote. Sumarlas al inventario vuelve a contarlas.
 *
 * Esto vivía copiado en cuatro consultas, dos de ellas incompletas, y las
 * cuatro apuntaban además a una categoría que no existe en producción, así que
 * llevaban meses sin filtrar nada. Ahora hay un solo fragmento y una prueba
 * que comprueba que las cuatro lo usan.
 *
 * Los cuatro sitios están en `BUNDLE_FILTER_CALLERS`, y
 * `tests/unit/lib/catalog-filters.test.ts` falla si alguno deja de usarlo.
 */
export const EXCLUDE_BUNDLE_PRODUCTS = {
  isKit: false,
  categoryId: { not: CAPSULAS_SORPRESA_ID },
} as const;

/**
 * Solo cápsulas, dejando pasar los kits.
 *
 * Inventario usa este: tiene una pestaña **«Kits»**, así que si el cargador
 * los dejara fuera esa pestaña saldría siempre vacía. El doble conteo ahí ya
 * está resuelto de otra forma —`inventoryRowValue` le da valor cero a un
 * kit—, que es lo que hace que aparezcan en la lista sin sumar al total.
 */
export const EXCLUDE_CAPSULE_PRODUCTS = {
  categoryId: { not: CAPSULAS_SORPRESA_ID },
} as const;

/**
 * Los archivos que deben filtrar bultos, con el fragmento que le toca a cada
 * uno. Si se agrega una lectura de stock nueva, va aquí y la prueba obliga a
 * que use uno de los dos.
 */
export const BUNDLE_FILTER_CALLERS = [
  { file: "lib/dashboard-today.ts", fragment: "EXCLUDE_BUNDLE_PRODUCTS" },
  { file: "app/api/[storeId]/products/catalog/route.ts", fragment: "EXCLUDE_BUNDLE_PRODUCTS" },
  { file: "actions/get-products.ts", fragment: "EXCLUDE_BUNDLE_PRODUCTS" },
  // Inventario enseña los kits a propósito: tiene una pestaña para ellos.
  {
    file: "app/(dashboard)/[storeId]/(routes)/inventario/server/get-inventory.ts",
    fragment: "EXCLUDE_CAPSULE_PRODUCTS",
  },
] as const;

/**
 * La misma regla como función, para poder probarla sin base de datos y para
 * usarla sobre filas ya cargadas.
 */
export function isBundleProduct(product: {
  isKit?: boolean | null;
  categoryId?: string | null;
}): boolean {
  return Boolean(product.isKit) || product.categoryId === CAPSULAS_SORPRESA_ID;
}
