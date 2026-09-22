"use client";

import axios from "axios";
import { Package, Search } from "lucide-react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import { BarcodeScanner } from "@/components/ui/barcode-scanner";
import { Skeleton } from "@/components/ui/skeleton";
import { TintBadge } from "@/components/ui/tint-badge";
import { useDebounce } from "@/hooks/use-debounce";
import { findExactSaleCandidate, saleCandidateChips, saleCandidateToLine, type SaleCandidate } from "@/lib/sale-search";
import type { SellLine } from "@/lib/sell-cart";
import { scanAccepted, scanRejected, type ScanOutcome } from "@/lib/scan-outcome";
import { cn, currencyFormatter } from "@/lib/utils";

interface SaleSearchResponse {
  data: (SaleCandidate & { available: boolean })[];
  metadata: { total?: number; truncated?: boolean };
}

interface SaleSearchProps {
  /** Contesta si la línea entró; `void` de quien no lo sepa se da por buena. */
  onAdd: (line: SellLine) => void | boolean | Promise<void | boolean>;
  disabled?: boolean;
  storeId?: string;
}

const fetcher = (url: string) => axios.get<SaleSearchResponse>(url).then((response) => response.data);

const buildUrl = (storeId: string, query: string) => `/api/${storeId}/products/search?mode=venta&q=${encodeURIComponent(query)}&limit=30`;

/**
 * Qué decirle cuando lo leído no se pudo agregar solo.
 *
 * Antes cualquier fallo decía «no coincide con ningún producto a la venta»,
 * incluso escaneando el QR de un producto activo y con unidades: mandaba a
 * Paula a buscar un problema de datos que no existía. Ahora se separan los dos
 * casos de verdad, y el genérico nombra el QR además del SKU y el código de
 * barras, con las mismas palabras que la pestaña de Etiquetas.
 */
export function describeUnresolvedCode(code: string, candidates: readonly SaleCandidate[]): string {
  if (candidates.length === 0) {
    return `«${code}» no coincide con ningún SKU, código de barras ni QR de etiqueta.`;
  }
  // Se encontró algo pero ninguno es exacto: que elija, sin acusar al código.
  if (candidates.length === 1) {
    return `«${code}» no es un código exacto. ¿Buscabas «${candidates[0].name}»?`;
  }
  return `«${code}» no es un código exacto: elige el producto de la lista.`;
}

type SaleRow = SaleCandidate & { available: boolean };

/**
 * Una fila de la lista.
 *
 * Va en `memo` porque la lista trae hasta treinta filas con su imagen y en el
 * mostrador se teclea rápido: sin esto, cada pulsación y cada flecha volvían a
 * pintar las treinta. Con `onPick` estable —y el resaltado como booleano— solo
 * se repintan la fila que entra y la que sale del resaltado.
 */
const SaleResultRow = memo(function SaleResultRow({
  candidate,
  highlighted,
  onPick,
}: {
  candidate: SaleRow;
  highlighted: boolean;
  onPick: (candidate: SaleRow) => void;
}) {
  const chips = saleCandidateChips(candidate);
  const offer = candidate.offerPrice != null && candidate.offerPrice < candidate.price;
  return (
    <button
      type="button"
      role="option"
      aria-selected={highlighted}
      aria-disabled={!candidate.available}
      data-available={candidate.available}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onPick(candidate)}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        highlighted && "bg-accent/60",
        !candidate.available && "opacity-55",
      )}
    >
      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md border bg-muted">
        {candidate.images?.[0]?.url ? (
          <Image src={candidate.images[0].url} alt="" fill sizes="36px" className="object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-muted-foreground">
            <Package className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* El nombre parte de línea en vez de cortarse: un nombre largo en 390 px ensanchaba toda la tarjeta. */}
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="min-w-0 break-words text-sm font-semibold leading-tight">{candidate.name}</span>
          {chips.map((chip) => (
            <TintBadge key={chip} label={chip} tone="lavender" className="text-[11px]" />
          ))}
        </span>
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          {candidate.sku} · {candidate.stock} und
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        {candidate.available ? (
          <>
            <span className="text-sm font-semibold tabular-nums">{currencyFormatter(offer ? (candidate.offerPrice as number) : candidate.price)}</span>
            {offer && <span className="text-[11px] text-muted-foreground line-through">{currencyFormatter(candidate.price)}</span>}
          </>
        ) : (
          <TintBadge label="Agotado" tone="pink" className="text-[11px]" />
        )}
      </span>
    </button>
  );
});

/**
 * Una sola entrada para vender: escribir, pegar, el lector de mano (escribe
 * y pulsa Enter), la cámara y el celular vinculado entran por aquí y se
 * resuelven con la búsqueda ordenada para el mostrador. El código exacto se
 * agrega solo; lo demás se elige de la lista. Un agotado se ve y no se agrega.
 */
export function SaleSearch({ onAdd, disabled, storeId: storeIdOverride }: SaleSearchProps) {
  const params = useParams();
  const storeId = storeIdOverride ?? String(params?.storeId ?? "");
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  /**
   * Tapa la lista después de meter algo por código.
   *
   * Al agregar se devuelve el foco a la casilla —el lector de mano escribe
   * ahí— y el foco por sí solo abría la lista con los más vendidos. Quedaba
   * en pantalla una lista de treinta productos con el recién escaneado
   * dentro, idéntica a un resultado de búsqueda esperando un clic: Paula
   * pulsaba la fila creyendo que hacía falta y **sumaba una segunda unidad**
   * de algo que escaneó una vez. La lista vuelve en cuanto se escribe o se
   * pulsa la casilla a propósito.
   */
  const [listSuppressed, setListSuppressed] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [notice, setNotice] = useState<{ tone: "pink" | "cream"; text: string } | null>(null);
  const [resolving, setResolving] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // En teléfono la casilla comparte fila con la cámara y el celular: el texto de ayuda se acorta.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(max-width: 639px)");
    const sync = () => setNarrow(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  const debounced = useDebounce(query.trim(), 250);
  // La primera página (más vendidos con unidades) se pide al abrir la pantalla, no al hacer clic.
  const { data, isLoading, error } = useSWR(buildUrl(storeId, debounced), fetcher, { keepPreviousData: true, revalidateOnFocus: false });
  const rows = useMemo(() => data?.data ?? [], [data]);
  // El lector guarda `resolveCode` en una referencia; si `resolveCode` se
  // rehiciera con cada revalidación de SWR, ese efecto correría sin parar.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const open = (focused || query.trim().length > 0) && !listSuppressed;
  // Las filas corresponden a lo escrito solo cuando el retardo ya pasó y la
  // respuesta llegó: un lector de mano escribe y pulsa Enter antes de eso.
  const rowsMatchQuery = debounced === query.trim() && !isLoading;

  useEffect(() => setHighlight(0), [debounced]);

  const add = useCallback(
    async (candidate: SaleCandidate & { available?: boolean }): Promise<ScanOutcome> => {
      if (candidate.stock <= 0) {
        setNotice({ tone: "pink", text: `«${candidate.name}» no tiene unidades: revisa Inventario antes de venderlo.` });
        return scanRejected(candidate.name);
      }
      // La venta puede rechazarla igual si ya se llegó al tope de unidades:
      // esa respuesta es la que hace que el lector suene distinto.
      const added = await onAdd(saleCandidateToLine(candidate));
      if (added === false) return scanRejected(candidate.name);
      setNotice(null);
      setQuery("");
      // El foco vuelve para el lector de mano, pero sin desplegar la lista.
      setListSuppressed(true);
      inputRef.current?.focus();
      return scanAccepted(candidate.name);
    },
    [onAdd],
  );

  /** Identidad estable: si cambiara en cada pintado, `memo` en la fila no serviría. */
  const pick = useCallback((candidate: SaleRow) => void add(candidate), [add]);

  /** Enter, lector de mano, cámara o celular: solo el código exacto entra sin elegir. */
  const resolveCode = useCallback(
    async (raw: string): Promise<ScanOutcome> => {
      const code = raw.trim();
      if (!code) return scanRejected();
      const local = findExactSaleCandidate(rowsRef.current, code);
      if (local) return add(local);
      try {
        setResolving(true);
        const fresh = await fetcher(buildUrl(storeId, code));
        const exact = findExactSaleCandidate(fresh.data, code);
        if (exact) return add(exact);
        setQuery(code);
        setNotice({
          tone: "cream",
          text: describeUnresolvedCode(code, fresh.data),
        });
        return scanRejected();
      } catch {
        setNotice({ tone: "pink", text: "No se pudo buscar. Revisa la conexión e inténtalo de nuevo." });
        return scanRejected();
      } finally {
        setResolving(false);
      }
    },
    [add, storeId],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setListSuppressed(false);
      setHighlight((index) => Math.min(index + 1, Math.max(rows.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const exact = findExactSaleCandidate(rows, query);
      if (exact) return void add(exact);
      const highlighted = rows[highlight];
      if (query.trim() && rowsMatchQuery && highlighted?.available) return void add(highlighted);
      void resolveCode(query);
    } else if (event.key === "Escape") {
      setQuery("");
      setNotice(null);
    }
  };

  const showSkeleton = isLoading && rows.length === 0;
  const truncated = Boolean(data?.metadata?.truncated);

  return (
    <div className="flex flex-col gap-2" data-testid="sale-search">
      <div className="flex items-start gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            id="sale-search-input"
            type="search"
            role="combobox"
            aria-expanded={open}
            aria-controls="sale-search-results"
            aria-autocomplete="list"
            aria-label="Buscar o escanear"
            autoComplete="off"
            enterKeyHint="done"
            disabled={disabled}
            value={query}
            placeholder={narrow ? "Nombre o código" : "Nombre, SKU o código de barras"}
            onChange={(event) => {
              setQuery(event.target.value);
              setNotice(null);
              setListSuppressed(false);
            }}
            /*
             * Pulsar la casilla a propósito sí quiere ver el catálogo.
             *
             * También marca el foco a mano: al agregar por código se devuelve
             * el foco a una casilla que a menudo ya lo tenía, y entonces el
             * navegador no dispara `focus`, así que `focused` se quedaba en
             * `false` mientras el cursor sí estaba dentro. Con eso, el clic
             * quitaba la tapa pero la lista seguía sin abrirse.
             */
            onPointerDown={() => {
              setListSuppressed(false);
              setFocused(true);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onKeyDown={onKeyDown}
            className="h-11 w-full rounded-lg border bg-white pl-9 pr-3 text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          />
        </div>
        <BarcodeScanner
          compact
          label="Escanear"
          description="Apunta al QR de la etiqueta o al código de barras del empaque. Lo leído entra por la misma búsqueda."
          onDetected={resolveCode}
          remoteStatusLabel
        />
      </div>
      {notice && (
        <p role="status" className={cn("rounded-lg px-3 py-2 text-sm", notice.tone === "pink" ? "bg-tint-pink text-primary" : "bg-tint-cream text-primary")}>
          {notice.text}
        </p>
      )}
      {open && (
        <div id="sale-search-results" role="listbox" aria-label="Resultados" aria-busy={showSkeleton || resolving} className="max-h-80 overflow-y-auto rounded-xl border bg-white p-1.5">
          {showSkeleton &&
            Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 px-2 py-2" aria-hidden="true">
                <Skeleton className="h-9 w-9 rounded-md" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          {!showSkeleton && error && <p className="px-3 py-3 text-sm text-destructive">No se pudo cargar la lista. Inténtalo de nuevo.</p>}
          {!showSkeleton && !error && rows.length === 0 && (
            <p className="px-3 py-3 text-sm text-muted-foreground">{debounced ? `Nada coincide con «${debounced}».` : "Aún no hay productos con unidades para vender."}</p>
          )}
          {rows.map((candidate, index) => (
            <SaleResultRow
              key={candidate.id}
              candidate={candidate}
              highlighted={index === highlight && query.trim().length > 0}
              onPick={pick}
            />
          ))}
          {truncated && <p className="px-3 py-2 text-xs text-muted-foreground">Mostrando los primeros 30 · escribe más para acotar.</p>}
        </div>
      )}
    </div>
  );
}
