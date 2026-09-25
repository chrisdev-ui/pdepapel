"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import ProductCard from "@/components/ui/product-card";
import { Product } from "@/types";

import Paginator from "./paginator";

interface ProductsProps {
  products: Product[];
  totalPages: number;
  /** Página que está mostrando el catálogo ahora mismo. */
  currentPage?: number;
  /** Trae otra página con los filtros vigentes; la pone quien tiene los filtros. */
  loadPage?: (page: number) => Promise<Product[] | null>;
}

/**
 * Cuántas tarjetas se pintan antes de que alguien pida ver más. Las demás ya
 * vienen en la respuesta: lo que se evita no son bytes de datos sino que el
 * navegador dispare de golpe una imagen por tarjeta. Con 24 salían 23 imágenes
 * en móvil y 44 en escritorio, y la petición del chunk de filtros —que llega
 * después de hidratar— se quedaba haciendo fila detrás de todas ellas.
 */
const INITIAL_VISIBLE = 12;

/** Cuántas se destapan de golpe al pedir más, para no repetir aquella avalancha. */
const REVEAL_STEP = 12;

/** Cuadrícula del catálogo: 2 columnas en teléfono, 3 en tableta y portátil, 4 desde 1280 px. */
const Products: React.FC<ProductsProps> = ({ products, totalPages, currentPage = 1, loadPage }) => {
  const [visible, setVisible] = useState(INITIAL_VISIBLE);
  /**
   * Productos de las páginas siguientes que ya se trajeron.
   *
   * «Cargar más» dejaba de existir al destapar las 24 de la página y, con 560
   * productos en 24 páginas, obligaba a descubrir el paginador numérico para
   * seguir. Quien viene tocando un botón que dice «cargar más» vuelve a tocar
   * donde estaba: ese era el clic muerto más repetido de `/tienda`. Ahora el
   * botón sigue trayendo páginas hasta que no queda nada.
   */
  const [extra, setExtra] = useState<Product[]>([]);
  const [lastPage, setLastPage] = useState(currentPage);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // Otra página o unos filtros nuevos vuelven a empezar por arriba.
  useEffect(() => {
    setVisible(INITIAL_VISIBLE);
    setExtra([]);
    setLastPage(currentPage);
    setFailed(false);
  }, [products, currentPage]);

  /*
   * Memorizadas porque la lista ya no se queda en 24: al encadenar «Cargar
   * más» puede llegar a cientos de tarjetas, y sin esto cada cambio de estado
   * —encender la rueda del botón, por ejemplo— reconstruía los dos arreglos y
   * volvía a pintar todas las tarjetas.
   */
  const all = useMemo(
    () => (extra.length > 0 ? [...products, ...extra] : products),
    [products, extra],
  );
  const shown = useMemo(() => all.slice(0, visible), [all, visible]);
  const hiddenHere = all.length - shown.length;
  const morePages = Boolean(loadPage) && lastPage < totalPages;
  const canLoadMore = hiddenHere > 0 || morePages;

  const onLoadMore = useCallback(async () => {
    // Quedan tarjetas ya traídas: destaparlas es instantáneo, sin red.
    if (hiddenHere > 0) {
      setVisible((current) => current + Math.min(REVEAL_STEP, hiddenHere));
      return;
    }
    if (!loadPage || loading || !morePages) return;

    setLoading(true);
    setFailed(false);
    const next = lastPage + 1;
    try {
      const page = await loadPage(next);
      // `null` = el catálogo no respondió. No se avanza de página para que
      // reintentar vuelva a pedir la misma y no se salte productos.
      if (!page) {
        setFailed(true);
        return;
      }
      setLastPage(next);
      if (page.length > 0) {
        setExtra((current) => [...current, ...page]);
        setVisible((current) => current + Math.min(REVEAL_STEP, page.length));
      }
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [hiddenHere, lastPage, loadPage, loading, morePages]);

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
        {shown.map((product, index) => (
          <ProductCard
            key={product.id}
            product={product}
            // La primera fila de escritorio son cuatro: cualquiera de ellas
            // puede ser el LCP, y con `priority` en dos, las otras dos salían
            // perezosas. Hasta la octava se piden sin esperar al diseño, pero
            // sin más avisos de precarga.
            priority={index < 4}
            loading={index < 8 ? "eager" : undefined}
            sizes="(max-width: 767px) 50vw, (max-width: 1279px) 33vw, 22vw"
          />
        ))}
      </div>
      {canLoadMore && (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => void onLoadMore()}
            disabled={loading}
            aria-busy={loading}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full border-[1.5px] border-blue-yankees bg-white px-6 font-sans text-[15px] font-semibold text-blue-yankees transition-colors hover:bg-blue-yankees hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-white disabled:hover:text-blue-yankees"
          >
            {loading ? (
              <>
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                Cargando…
              </>
            ) : (
              <>Cargar más{hiddenHere > 0 ? ` (${hiddenHere})` : ""}</>
            )}
          </button>
          {failed && (
            <p role="status" className="text-sm text-gray-600">
              No se pudieron traer más productos. Inténtalo otra vez o usa las páginas de abajo.
            </p>
          )}
        </div>
      )}
      {totalPages > 1 && <Paginator totalPages={totalPages} />}
    </div>
  );
};

export default Products;
