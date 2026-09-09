const STORAGE_KEY = "pdp:busquedas-recientes";
export const MAX_RECENT_SEARCHES = 5;

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function write(items: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_RECENT_SEARCHES)));
  } catch {
    // Navegación privada o almacenamiento bloqueado: se sigue sin recientes.
  }
}

export function getRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  return read();
}

/** Guarda la búsqueda al frente, sin duplicados (ignorando mayúsculas), máximo cinco. */
export function rememberSearch(query: string): string[] {
  const term = query.trim();
  if (!term || typeof window === "undefined") return getRecentSearches();
  const next = [term, ...read().filter((item) => item.toLocaleLowerCase("es-CO") !== term.toLocaleLowerCase("es-CO"))];
  write(next);
  return next.slice(0, MAX_RECENT_SEARCHES);
}

export function forgetSearch(query: string): string[] {
  if (typeof window === "undefined") return [];
  const next = read().filter((item) => item !== query);
  write(next);
  return next;
}
