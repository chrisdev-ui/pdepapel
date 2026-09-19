"use client";

import axios from "axios";
import { Package, Search } from "lucide-react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import { BarcodeScanner } from "@/components/ui/barcode-scanner";
import { Skeleton } from "@/components/ui/skeleton";
import { TintBadge } from "@/components/ui/tint-badge";
import { useDebounce } from "@/hooks/use-debounce";
import { findExactSaleCandidate, saleCandidateChips, saleCandidateToLine, type SaleCandidate } from "@/lib/sale-search";
import type { SellLine } from "@/lib/sell-cart";
import { cn, currencyFormatter } from "@/lib/utils";

interface SaleSearchResponse {
  data: (SaleCandidate & { available: boolean })[];
  metadata: { total?: number; truncated?: boolean };
}

interface SaleSearchProps {
  onAdd: (line: SellLine) => void;
  disabled?: boolean;
  storeId?: string;
}

const fetcher = (url: string) => axios.get<SaleSearchResponse>(url).then((response) => response.data);

const buildUrl = (storeId: string, query: string) => `/api/${storeId}/products/search?mode=venta&q=${encodeURIComponent(query)}&limit=30`;

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
  const open = focused || query.trim().length > 0;
  // Las filas corresponden a lo escrito solo cuando el retardo ya pasó y la
  // respuesta llegó: un lector de mano escribe y pulsa Enter antes de eso.
  const rowsMatchQuery = debounced === query.trim() && !isLoading;

  useEffect(() => setHighlight(0), [debounced]);

  const add = useCallback(
    (candidate: SaleCandidate & { available?: boolean }) => {
      if (candidate.stock <= 0) {
        setNotice({ tone: "pink", text: `«${candidate.name}» no tiene unidades: revisa Inventario antes de venderlo.` });
        return;
      }
      onAdd(saleCandidateToLine(candidate));
      setNotice(null);
      setQuery("");
      inputRef.current?.focus();
    },
    [onAdd],
  );

  /** Enter, lector de mano, cámara o celular: solo el código exacto entra sin elegir. */
  const resolveCode = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      const local = findExactSaleCandidate(rows, code);
      if (local) {
        add(local);
        return;
      }
      try {
        setResolving(true);
        const fresh = await fetcher(buildUrl(storeId, code));
        const exact = findExactSaleCandidate(fresh.data, code);
        if (exact) {
          add(exact);
          return;
        }
        setQuery(code);
        setNotice({
          tone: "cream",
          text: fresh.data.length > 0 ? `«${code}» no es un código exacto: elige el producto de la lista.` : `«${code}» no coincide con ningún producto a la venta.`,
        });
      } catch {
        setNotice({ tone: "pink", text: "No se pudo buscar. Revisa la conexión e inténtalo de nuevo." });
      } finally {
        setResolving(false);
      }
    },
    [add, rows, storeId],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((index) => Math.min(index + 1, Math.max(rows.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const exact = findExactSaleCandidate(rows, query);
      if (exact) return add(exact);
      const highlighted = rows[highlight];
      if (query.trim() && rowsMatchQuery && highlighted?.available) return add(highlighted);
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
          onDetected={(code) => void resolveCode(code)}
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
          {rows.map((candidate, index) => {
            const chips = saleCandidateChips(candidate);
            const offer = candidate.offerPrice != null && candidate.offerPrice < candidate.price;
            const isHighlighted = index === highlight && query.trim().length > 0;
            return (
              <button
                key={candidate.id}
                type="button"
                role="option"
                aria-selected={isHighlighted}
                aria-disabled={!candidate.available}
                data-available={candidate.available}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => add(candidate)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isHighlighted && "bg-accent/60",
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
          })}
          {truncated && <p className="px-3 py-2 text-xs text-muted-foreground">Mostrando los primeros 30 · escribe más para acotar.</p>}
        </div>
      )}
    </div>
  );
}
