/**
 * Los parámetros con que las copias ISR (`/catalogo-cache/*`) llaman a las
 * páginas públicas de listado. Se compara por identidad: así la página sabe
 * que es la copia en caché sin un prop extra (Next no deja agregarle props a
 * una página) y sin mirar si los parámetros vienen vacíos.
 */
export const CACHED_LISTING_PARAMS: Readonly<Record<string, never>> = Object.freeze({});

export const isCachedListingRender = (searchParams: object) => searchParams === CACHED_LISTING_PARAMS;
