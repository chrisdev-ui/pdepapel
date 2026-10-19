/**
 * Lo único que el selector de tiendas necesita del registro de la tienda. El
 * panel le pasaba la fila entera al navegador (márgenes, pisos de Mercado
 * Libre, contacto, dirección) en todas las páginas.
 */
export const STORE_PICKER_SELECT = { id: true, name: true } as const;

export type StorePickerItem = { id: string; name: string };
