/**
 * Al volver de una ficha con «Atrás», el navegador restaura el scroll antes de
 * que el listado vuelva a pintarse, y el listado arranca con menos tarjetas de
 * las que había: la página queda más corta y el scroll se pierde. Aquí se
 * guarda, por URL del listado, cuántas tarjetas se veían y la altura, para
 * restaurarlas solo en una navegación de historial.
 */
export interface ListingState {
  visible: number;
  lastPage: number;
  scrollY: number;
}

export const LISTING_RESTORE_TTL_MS = 30 * 60 * 1000;
const POPSTATE_WINDOW_MS = 3_000;
const PREFIX = "pdp:listing:";

let lastPopState = 0;
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    lastPopState = Date.now();
  });
}

export function listingKey() {
  return `${window.location.pathname}${window.location.search}`;
}

/** true una sola vez justo después de «Atrás» o «Adelante». */
export function consumeBackNavigation(now = Date.now()) {
  const recent = lastPopState > 0 && now - lastPopState <= POPSTATE_WINDOW_MS;
  lastPopState = 0;
  return recent;
}

export function readListingState(now = Date.now()): ListingState | null {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + listingKey());
    if (!raw) return null;
    const { at, visible, lastPage, scrollY } = JSON.parse(raw) as Partial<ListingState> & { at?: number };
    if (typeof at !== "number" || now - at > LISTING_RESTORE_TTL_MS) return null;
    if (typeof visible !== "number" || typeof lastPage !== "number" || typeof scrollY !== "number") return null;
    return { visible, lastPage, scrollY };
  } catch {
    return null;
  }
}

export function saveListingState(patch: Partial<ListingState>, now = Date.now()) {
  try {
    const key = PREFIX + listingKey();
    const previous = JSON.parse(window.sessionStorage.getItem(key) ?? "{}") as Partial<ListingState>;
    window.sessionStorage.setItem(key, JSON.stringify({ visible: 0, lastPage: 1, scrollY: 0, ...previous, ...patch, at: now }));
  } catch {
    // Sin almacenamiento (navegación privada, bloqueado) solo se pierde la restauración.
  }
}
