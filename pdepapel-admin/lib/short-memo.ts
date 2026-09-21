/**
 * Memoria corta en proceso, para pantallas que se abren mucho.
 *
 * Nació en Clientes: la agrupación recorría todos los pedidos en cada visita.
 * La idea es la misma aquí y el peligro también, así que conviene decirlo una
 * vez: **guardar en memoria el resultado de una consulta es arriesgado**
 * cuando una venta recién hecha tiene que verse. Por eso hay dos formas de
 * usarla, y ninguna guarda nada «hasta que caduque» a secas:
 *
 * - Con **marca de agua** (`watermark`): antes de reutilizar se hace una
 *   pregunta barata —cuántas filas hay y cuál se tocó de última—. Si algo se
 *   creó, se editó o se borró, la marca cambia y se vuelve a construir. Es
 *   para cifras que deben ser exactas, como el gráfico de ventas del año.
 * - Sin marca, solo con vigencia: para lo que da igual que tenga un minuto,
 *   como el estado de los trabajos automáticos.
 *
 * La vigencia siempre está, marca o no, porque una marca no ve todo: en
 * Clientes no veía el renombrado de un producto, y aquí tampoco vería un
 * cambio que no toque la fila vigilada.
 *
 * Vive por instancia de función. En Vercel cada instancia tiene la suya, así
 * que esto baja el trabajo repetido de una misma instancia; no es una caché
 * compartida ni pretende serlo.
 */

const DEFAULT_TTL_MS = 60_000;
const MAX_ENTRIES = 24;

interface Entry {
  watermark: string;
  at: number;
  value: unknown;
}

const entries = new Map<string, Entry>();

export interface ShortMemoOptions<T> {
  /** Identifica la consulta y su ámbito, p. ej. `grafico-ventas:<tienda>:2026`. */
  key: string;
  /** Qué construir cuando no hay nada reutilizable. */
  build: () => Promise<T>;
  /**
   * Pregunta barata que cambia cuando los datos cambian. Sin ella, la entrada
   * solo depende de la vigencia: úsalo únicamente donde un minuto de retraso
   * no le miente a nadie.
   */
  watermark?: () => Promise<string>;
  ttlMs?: number;
}

export async function shortMemo<T>({
  key,
  build,
  watermark,
  ttlMs = DEFAULT_TTL_MS,
}: ShortMemoOptions<T>): Promise<T> {
  const mark = watermark ? await watermark() : "";
  const hit = entries.get(key);
  if (hit && hit.watermark === mark && Date.now() - hit.at < ttlMs) {
    return hit.value as T;
  }

  const value = await build();
  if (entries.size >= MAX_ENTRIES) entries.clear();
  entries.set(key, { watermark: mark, at: Date.now(), value });
  return value;
}

/** Solo para las pruebas: la memoria corta no debe cruzarse entre casos. */
export function __resetShortMemo() {
  entries.clear();
}
