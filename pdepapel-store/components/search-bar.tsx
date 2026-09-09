"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, KeyboardEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { SearchLink, SearchResults } from "@/components/search-results";
import { useDebounce } from "@/hooks/use-debounce";
import useSearchProducts from "@/hooks/use-search-products";
import { stripTaxonomyIcon } from "@/lib/catalog-labels";
import { NavigationType } from "@/lib/catalog-navigation";
import { trackCustomerEvent } from "@/lib/customer-analytics";
import { forgetSearch, getRecentSearches, rememberSearch } from "@/lib/recent-searches";
import { categoryPath, offersPath, STOREFRONT_ROUTES, typePath } from "@/lib/routes";
import { TypeIcon } from "@/lib/type-icons";
import { cn } from "@/lib/utils";
import { SearchResult } from "@/types";

interface SearchBarProps {
  /** `inline`: full-width field (phones/tablets). `desktop`: wide field with a Buscar button. */
  variant?: "inline" | "desktop";
  placeholder?: string;
  className?: string;
  /** Tipos con subcategorías para sugerir categorías y atajos. */
  types?: NavigationType[];
}

const MIN_QUERY_LENGTH = 2;
const MAX_PRODUCTS = 6;
const MAX_CATEGORY_MATCHES = 3;
const EXPLORE_LIMIT = 5;

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es-CO");

/**
 * Catalog search used in the header on every breakpoint. Focusing shows the
 * recent searches and type shortcuts; typing shows matching categories, up to
 * six products and a link to the full results in /tienda. Enter (or Buscar)
 * opens the full results; arrows move through the options.
 */
export const SearchBar: React.FC<SearchBarProps> = ({ variant = "inline", placeholder = "Busca cuadernos, stickers, agendas…", className, types = [] }) => {
  const router = useRouter();
  const rootRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  const debouncedSearch = useDebounce(inputValue.trim(), 300);
  const hasQuery = debouncedSearch.length >= MIN_QUERY_LENGTH;
  const { data, status } = useSearchProducts(hasQuery ? debouncedSearch : "");
  const products = useMemo(() => (hasQuery ? ((data as SearchResult[] | undefined) ?? []).slice(0, MAX_PRODUCTS) : []), [data, hasQuery]);

  useEffect(() => {
    setRecents(getRecentSearches());
  }, []);

  const explore = useMemo<SearchLink[]>(() => {
    const links = types.slice(0, EXPLORE_LIMIT).map((type) => ({ label: type.label, href: typePath(type), icon: <TypeIcon type={type} className="h-4 w-4" /> }));
    return links.length > 0 ? [...links, { label: "Ofertas", href: offersPath }] : [];
  }, [types]);

  const categoryMatches = useMemo<SearchLink[]>(() => {
    if (!hasQuery) return [];
    const needle = fold(debouncedSearch);
    const matches: SearchLink[] = [];
    for (const type of types) {
      if (fold(type.label).includes(needle)) matches.push({ label: type.label, href: typePath(type), meta: "categoría" });
      for (const category of type.subcategories) {
        const label = stripTaxonomyIcon(category.name);
        if (fold(label).includes(needle)) matches.push({ label, href: categoryPath(category.slug || category.id), meta: type.label });
      }
    }
    return matches.slice(0, MAX_CATEGORY_MATCHES);
  }, [debouncedSearch, hasQuery, types]);

  const options = useMemo(() => {
    const hrefs: { href: string; onPick?: () => void }[] = [];
    if (!hasQuery) {
      recents.forEach((recent) => hrefs.push({ href: `${STOREFRONT_ROUTES.shop}?search=${encodeURIComponent(recent)}`, onPick: () => rememberSearch(recent) }));
      explore.forEach((link) => hrefs.push({ href: link.href }));
      return hrefs;
    }
    if (status !== "success") return hrefs;
    categoryMatches.forEach((link) => hrefs.push({ href: link.href }));
    products.forEach((product) => hrefs.push({ href: `/producto/${product.slug || product.id}` }));
    if (categoryMatches.length > 0 || products.length > 0) hrefs.push({ href: `${STOREFRONT_ROUTES.shop}?search=${encodeURIComponent(debouncedSearch)}` });
    return hrefs;
  }, [categoryMatches, debouncedSearch, explore, hasQuery, products, recents, status]);

  const showPanel = isOpen && (hasQuery || recents.length > 0 || explore.length > 0);
  const optionId = useCallback((index: number) => `${listboxId}-opcion-${index}`, [listboxId]);
  const activeId = activeIndex >= 0 && activeIndex < options.length ? optionId(activeIndex) : null;

  const close = useCallback(() => {
    setIsOpen(false);
    setActiveIndex(-1);
  }, []);

  const closeAll = useCallback(() => {
    setInputValue("");
    close();
    inputRef.current?.blur();
  }, [close]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen, close]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [debouncedSearch, isOpen]);

  const navigateTo = useCallback(
    (query: string) => {
      const term = query.trim();
      if (!term) {
        inputRef.current?.focus();
        return;
      }
      trackCustomerEvent("search", { search_term: term });
      setRecents(rememberSearch(term));
      close();
      inputRef.current?.blur();
      router.push(`${STOREFRONT_ROUTES.shop}?search=${encodeURIComponent(term)}`);
    },
    [close, router],
  );

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
    setIsOpen(true);
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAll();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (options.length === 0) return;
        event.preventDefault();
        setIsOpen(true);
        setActiveIndex((current) => {
          const next = event.key === "ArrowDown" ? current + 1 : current - 1;
          return (next + options.length) % options.length;
        });
        return;
      }
      if (event.key === "Enter" && activeIndex >= 0 && options[activeIndex]) {
        event.preventDefault();
        const option = options[activeIndex];
        option.onPick?.();
        closeAll();
        router.push(option.href);
      }
    },
    [activeIndex, closeAll, options, router],
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      navigateTo(inputValue);
    },
    [inputValue, navigateTo],
  );

  const isDesktop = variant === "desktop";

  return (
    <form ref={rootRef} role="search" onSubmit={handleSubmit} className={cn("relative w-full", isDesktop && "max-w-[620px]", className)}>
      <div
        className={cn(
          "flex items-center gap-2 rounded-full bg-white text-blue-yankees shadow-[0_1px_2px_rgba(34,27,65,0.08)] focus-within:ring-2 focus-within:ring-blue-yankees focus-within:ring-offset-2 focus-within:ring-offset-blue-baby",
          isDesktop ? "h-12 pl-4 pr-1.5" : "h-11 px-3.5",
        )}
      >
        <Search aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          type="search"
          name="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          role="combobox"
          aria-label="Buscar productos"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls={showPanel ? listboxId : undefined}
          aria-activedescendant={showPanel && activeId ? activeId : undefined}
          placeholder={placeholder}
          value={inputValue}
          onChange={handleChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className="h-full min-w-0 flex-1 bg-transparent font-sans text-base font-medium placeholder:text-muted-foreground focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {inputValue ? (
          <button
            type="button"
            aria-label="Borrar búsqueda"
            onClick={() => {
              setInputValue("");
              inputRef.current?.focus();
            }}
            className="flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-full text-muted-foreground hover:bg-blue-baby/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        ) : null}
        {isDesktop ? (
          <button
            type="submit"
            className="flex h-9 shrink-0 items-center rounded-full bg-blue-yankees px-4 font-sans text-sm font-semibold text-white transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2"
          >
            Buscar
          </button>
        ) : (
          <button type="submit" className="sr-only">
            Buscar
          </button>
        )}
      </div>
      {showPanel ? (
        <SearchResults
          id={listboxId}
          query={debouncedSearch}
          hasQuery={hasQuery}
          recents={recents}
          explore={explore}
          categories={categoryMatches}
          products={products}
          status={hasQuery ? (status as "pending" | "success" | "error") : "idle"}
          activeId={activeId}
          optionId={optionId}
          onPickRecent={(recent) => {
            setInputValue(recent);
            navigateTo(recent);
          }}
          onForgetRecent={(recent) => setRecents(forgetSearch(recent))}
          closeAll={closeAll}
        />
      ) : null}
    </form>
  );
};
