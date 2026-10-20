/**
 * El destino de /capsulas (enlace de la bio) hacia la edición LIVE. `redirect()`
 * de Next no reenvía la consulta: se pasan a mano solo los `utm_*`, que GA4
 * lee en la primera página. Nada más (un `vista` no tiene sentido aquí).
 */
export function withUtmParams(path: string, searchParams: Record<string, string | string[] | undefined>): string {
  const kept = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (!key.toLowerCase().startsWith("utm_")) continue;
    for (const item of Array.isArray(value) ? value : [value]) if (typeof item === "string") kept.append(key, item);
  }
  const query = kept.toString();
  return query ? `${path}?${query}` : path;
}
