import { AlertTriangle, ArrowRight, Clock, LayoutGrid, X } from "lucide-react";
import Link from "next/link";
import { ReactNode } from "react";

import { SearchItem } from "@/components/search-item";
import { SearchItemsSkeleton } from "@/components/search-items-skeleton";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { SearchResult } from "@/types";

export interface SearchLink {
  label: string;
  href: string;
  meta?: string;
  icon?: ReactNode;
}

export interface SearchOption {
  id: string;
  href: string;
}

interface SearchResultsProps {
  id: string;
  query: string;
  hasQuery: boolean;
  recents: string[];
  explore: SearchLink[];
  categories: SearchLink[];
  products: SearchResult[];
  status: "idle" | "pending" | "success" | "error";
  activeId: string | null;
  optionId: (index: number) => string;
  onPickRecent: (query: string) => void;
  onForgetRecent: (query: string) => void;
  closeAll: () => void;
}

const CHIP_TINTS = ["bg-kawaii-lavender-light", "bg-kawaii-pink-light/60", "bg-kawaii-mint-light", "bg-kawaii-yellow-light", "bg-kawaii-blue-light"];

const SectionLabel = ({ children }: { children: ReactNode }) => (
  <p className="px-2.5 pb-1 pt-2 font-sans text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{children}</p>
);

const footerClass = "flex h-12 items-center justify-center gap-2 border-t border-border font-sans text-sm font-bold text-blue-yankees hover:bg-kawaii-lavender-light/40";

/**
 * Desplegable de la búsqueda: recientes y atajos al enfocar; categorías,
 * productos y «Ver todos los resultados» al escribir; esqueleto y vacío con salidas.
 */
export const SearchResults: React.FC<SearchResultsProps> = ({
  id,
  query,
  hasQuery,
  recents,
  explore,
  categories,
  products,
  status,
  activeId,
  optionId,
  onPickRecent,
  onForgetRecent,
  closeAll,
}) => {
  let optionIndex = 0;
  const nextId = () => optionId(optionIndex++);
  const allHref = `${STOREFRONT_ROUTES.shop}?search=${encodeURIComponent(query)}`;

  return (
    <div
      id={id}
      role="listbox"
      aria-label={hasQuery ? `Resultados para ${query}` : "Sugerencias de búsqueda"}
      className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-border bg-white p-1.5 shadow-[0_16px_40px_rgba(34,27,65,0.18)] animate-in fade-in-0 zoom-in-95"
    >
      <div className="max-h-[min(30rem,70vh)] overflow-y-auto overscroll-contain">
        {!hasQuery && recents.length > 0 && (
          <>
            <SectionLabel>Recientes</SectionLabel>
            <ul className="flex flex-col">
              {recents.map((recent) => {
                const rowId = nextId();
                return (
                  <li key={recent} id={rowId} role="option" aria-selected={activeId === rowId} className={cn("flex min-h-11 items-center gap-2.5 rounded-xl pl-2.5 pr-1", activeId === rowId && "bg-kawaii-lavender-light")}>
                    <Clock aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <button type="button" tabIndex={-1} onClick={() => onPickRecent(recent)} className="min-w-0 flex-1 truncate text-left font-sans text-sm font-medium text-blue-yankees">
                      {recent}
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={`Olvidar búsqueda ${recent}`}
                      onClick={() => onForgetRecent(recent)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                    >
                      <X aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {!hasQuery && explore.length > 0 && (
          <>
            <SectionLabel>Explora</SectionLabel>
            <ul className="flex flex-wrap gap-2 px-2.5 pb-2.5 pt-0.5">
              {explore.map((link, index) => {
                const rowId = nextId();
                return (
                  <li key={link.href} id={rowId} role="option" aria-selected={activeId === rowId}>
                    <Link
                      href={link.href}
                      tabIndex={-1}
                      onClick={closeAll}
                      className={cn(
                        "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 font-sans text-[13px] font-semibold text-blue-yankees",
                        CHIP_TINTS[index % CHIP_TINTS.length],
                        activeId === rowId && "ring-2 ring-blue-yankees",
                      )}
                    >
                      {link.icon}
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {hasQuery && status === "pending" && (
          <>
            <SectionLabel>Productos</SectionLabel>
            <SearchItemsSkeleton items={3} />
          </>
        )}
        {hasQuery && status === "error" && (
          <div className="flex items-center justify-center gap-2.5 p-4 font-sans text-sm text-blue-yankees">
            <AlertTriangle aria-hidden="true" className="h-5 w-5 text-red-500" />
            Ha ocurrido un error al buscar. Inténtalo de nuevo.
          </div>
        )}
        {hasQuery && status === "success" && categories.length > 0 && (
          <>
            <SectionLabel>Categorías</SectionLabel>
            <ul className="flex flex-col">
              {categories.map((link) => {
                const rowId = nextId();
                return (
                  <li key={link.href} id={rowId} role="option" aria-selected={activeId === rowId}>
                    <Link
                      href={link.href}
                      tabIndex={-1}
                      onClick={closeAll}
                      className={cn("flex min-h-10 items-center gap-2.5 rounded-xl px-2.5 font-sans text-sm font-semibold text-blue-yankees hover:bg-kawaii-lavender-light/60", activeId === rowId && "bg-kawaii-lavender-light")}
                    >
                      <LayoutGrid aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                      {link.label}
                      {link.meta && <span className="text-xs font-medium text-muted-foreground">· {link.meta}</span>}
                      <ArrowRight aria-hidden="true" className="ml-auto h-3.5 w-3.5 text-muted-foreground/60" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {hasQuery && status === "success" && products.length > 0 && (
          <>
            <SectionLabel>Productos</SectionLabel>
            <ul className="flex flex-col">
              {products.map((product) => {
                const rowId = nextId();
                return <SearchItem key={product.id} {...product} query={query} optionId={rowId} active={activeId === rowId} closeAll={closeAll} />;
              })}
            </ul>
          </>
        )}
        {hasQuery && status === "success" && products.length === 0 && categories.length === 0 && (
          <>
            <div className="flex flex-col items-center gap-1 px-4 pb-2 pt-5 text-center">
              <p className="font-sans text-base font-bold text-blue-yankees">Sin resultados para «{query}»</p>
              <p className="font-sans text-[13px] text-muted-foreground">Revisa la ortografía o prueba con menos palabras.</p>
            </div>
            {explore.length > 0 && (
              <>
                <SectionLabel>Te puede interesar</SectionLabel>
                <ul className="flex flex-wrap gap-2 px-2.5 pb-2.5 pt-0.5">
                  {explore.slice(0, 4).map((link, index) => (
                    <li key={link.href}>
                      <Link href={link.href} tabIndex={-1} onClick={closeAll} className={cn("inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 font-sans text-[13px] font-semibold text-blue-yankees", CHIP_TINTS[index % CHIP_TINTS.length])}>
                        {link.icon}
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
      {hasQuery && status === "success" && (products.length > 0 || categories.length > 0) && (
        <div id={nextId()} role="option" aria-selected={activeId === optionId(optionIndex - 1)} className={cn(activeId === optionId(optionIndex - 1) && "bg-kawaii-lavender-light")}>
          <Link href={allHref} tabIndex={-1} onClick={closeAll} className={cn(footerClass, "rounded-b-xl")}>
            Ver todos los resultados para «{query}»
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      )}
      {hasQuery && status === "success" && products.length === 0 && categories.length === 0 && (
        <Link href={STOREFRONT_ROUTES.shop} tabIndex={-1} onClick={closeAll} className={cn(footerClass, "rounded-b-xl")}>
          Ver toda la tienda
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
};
