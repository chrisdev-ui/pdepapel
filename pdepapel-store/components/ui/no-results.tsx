import { RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";

import { STOREFRONT_ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

interface NoResultsProps {
  message: string;
  className?: string;
}

/** Mensaje corto para listas pequeñas (carrito, relacionados). */
export const NoResults: React.FC<NoResultsProps> = ({ message, className }) => {
  return (
    <div className={cn("flex h-full w-full items-center justify-center font-sans text-neutral-500", className)}>
      {message}
    </div>
  );
};

export interface SuggestionChip {
  label: string;
  href: string;
}

const CHIP_TINTS = ["bg-kawaii-lavender-light", "bg-kawaii-pink-light/60", "bg-kawaii-mint-light", "bg-kawaii-yellow-light", "bg-kawaii-blue-light"];

interface NoResultsPanelProps {
  variant: "search" | "filters" | "error";
  query?: string | null;
  suggestions?: SuggestionChip[];
  onClearFilters?: () => void;
  onRetry?: () => void;
  className?: string;
}

/** Vacío del catálogo con salidas: categorías sugeridas, toda la tienda y limpiar filtros. */
export function NoResultsPanel({ variant, query, suggestions = [], onClearFilters, onRetry, className }: NoResultsPanelProps) {
  const isError = variant === "error";
  const title = isError ? "No pudimos cargar los productos" : variant === "search" && query ? `No encontramos «${query}»` : "Nada con estos filtros";
  const description = isError
    ? "Inténtalo de nuevo en unos segundos. Si sigue fallando, escríbenos por WhatsApp."
    : variant === "search"
      ? "Revisa la ortografía, prueba con menos palabras o quita algún filtro. Estas categorías suelen tener lo que buscas:"
      : "Quita alguno de los filtros o mira estas categorías:";

  return (
    <div
      role={isError ? "alert" : "status"}
      className={cn(
        "flex flex-col items-center gap-4 rounded-2xl px-6 py-10 text-center sm:py-12",
        isError ? "bg-red-50" : "border-[1.5px] border-dashed border-blue-purple/50",
        className,
      )}
    >
      <span className={cn("inline-flex h-14 w-14 items-center justify-center rounded-full", isError ? "bg-red-100 text-red-700" : "bg-kawaii-lavender-light text-blue-yankees")}>
        {isError ? <RefreshCw aria-hidden="true" className="h-6 w-6" /> : variant === "search" ? <Search aria-hidden="true" className="h-6 w-6" /> : <SlidersHorizontal aria-hidden="true" className="h-6 w-6" />}
      </span>
      <h2 className="text-balance font-serif text-2xl font-bold text-blue-yankees">{title}</h2>
      <p className="max-w-[46ch] font-sans text-[15px] leading-relaxed text-blue-yankees/80">{description}</p>
      {!isError && suggestions.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-2">
          {suggestions.map((chip, index) => (
            <li key={chip.href}>
              <Link
                href={chip.href}
                className={cn("inline-flex h-10 items-center rounded-full px-4 font-sans text-sm font-semibold text-blue-yankees transition-opacity hover:opacity-80", CHIP_TINTS[index % CHIP_TINTS.length])}
              >
                {chip.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap justify-center gap-2.5">
        {isError ? (
          <button type="button" onClick={onRetry} className="inline-flex h-11 items-center gap-2 rounded-full border-2 border-blue-yankees px-5 font-sans text-sm font-bold text-blue-yankees">
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            Intentar de nuevo
          </button>
        ) : (
          <>
            {variant === "filters" && onClearFilters ? (
              <button type="button" onClick={onClearFilters} className="inline-flex h-11 items-center rounded-full bg-blue-yankees px-5 font-sans text-sm font-bold text-white transition-opacity hover:opacity-85">
                Limpiar filtros
              </button>
            ) : null}
            <Link
              href={STOREFRONT_ROUTES.shop}
              className={cn(
                "inline-flex h-11 items-center rounded-full px-5 font-sans text-sm font-bold transition-opacity hover:opacity-85",
                variant === "filters" && onClearFilters ? "border-2 border-blue-yankees text-blue-yankees" : "bg-blue-yankees text-white",
              )}
            >
              Ver toda la tienda
            </Link>
            {variant === "search" && onClearFilters ? (
              <button type="button" onClick={onClearFilters} className="inline-flex h-11 items-center rounded-full border-2 border-blue-yankees px-5 font-sans text-sm font-bold text-blue-yankees">
                Limpiar filtros
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
