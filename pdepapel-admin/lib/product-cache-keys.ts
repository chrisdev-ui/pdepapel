/**
 * Llaves de Redis que cambian cuando cambia un producto. La búsqueda de la
 * tienda (1 h) y el selector del panel se quedaban rancios porque solo se
 * purgaba `products:*`: un producto archivado seguía apareciendo en el
 * buscador durante una hora. Módulo puro, sin dependencias de entorno.
 */
export function productCacheKeyPatterns(storeId: string): string[] {
  return [
    `store:${storeId}:products:*`,
    `store:${storeId}:search:*`,
    `store:${storeId}:search-vocabulary:*`,
    `store:${storeId}:admin-select:*`,
  ];
}
