"use client";

import { Search, X } from "lucide-react";
import { memo, useCallback, useEffect, useId, useRef, useState } from "react";

import { useDebounce } from "@/hooks/use-debounce";
import { useProductFilters } from "@/hooks/use-product-filters";
import { trackCustomerEvent } from "@/lib/customer-analytics";
import { cn } from "@/lib/utils";

interface ShopSearchBarProps {
  className?: string;
  placeholder?: string;
}

/**
 * Búsqueda dentro de una categoría («Buscar en Stickers»), con la misma
 * píldora que el campo de la cabecera. La tienda completa no la usa: ahí
 * busca la cabecera.
 */
const ShopSearchBar: React.FC<ShopSearchBarProps> = ({ className, placeholder = "Buscar en esta categoría" }) => {
  const { filters, setFilter } = useProductFilters();
  const [searchTerm, setSearchTerm] = useState<string>(filters.search || "");
  const debouncedSearch = useDebounce(searchTerm, 300);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(event.target.value), []);

  useEffect(() => {
    if (document.activeElement !== inputRef.current && filters.search !== searchTerm) {
      setSearchTerm(filters.search || "");
    }
  }, [filters.search, searchTerm]);

  useEffect(() => {
    if (debouncedSearch !== filters.search && inputRef.current && inputRef.current.offsetParent !== null) {
      setFilter("search", debouncedSearch || null);
      if (debouncedSearch) trackCustomerEvent("catalog_search", { query_length: debouncedSearch.length });
    }
  }, [debouncedSearch, filters.search, setFilter]);

  return (
    <div className={cn("relative flex h-11 items-center rounded-full border-[1.5px] border-border bg-white pl-3.5 pr-1 focus-within:border-blue-yankees focus-within:ring-2 focus-within:ring-blue-yankees/20 lg:h-10", className)}>
      <label htmlFor={inputId} className="sr-only">
        {placeholder}
      </label>
      <Search aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
      <input
        id={inputId}
        ref={inputRef}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        placeholder={placeholder}
        value={searchTerm}
        onChange={handleChange}
        className="h-full min-w-0 flex-1 bg-transparent px-2.5 font-sans text-sm text-blue-yankees placeholder:text-muted-foreground focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {searchTerm ? (
        <button
          type="button"
          aria-label="Borrar búsqueda"
          onClick={() => {
            setSearchTerm("");
            inputRef.current?.focus();
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
};

export default memo(ShopSearchBar);
