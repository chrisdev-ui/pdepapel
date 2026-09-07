"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useInView } from "react-intersection-observer";

import { SearchResults } from "@/components/search-results";
import { useDebounce } from "@/hooks/use-debounce";
import useSearchProducts from "@/hooks/use-search-products";
import { trackCustomerEvent } from "@/lib/customer-analytics";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { SearchResult } from "@/types";

interface SearchBarProps {
  /** `inline`: full-width field (phones/tablets). `desktop`: wide field with a Buscar button. */
  variant?: "inline" | "desktop";
  placeholder?: string;
  className?: string;
}

const MIN_QUERY_LENGTH = 2;

/**
 * Catalog search used in the header on every breakpoint. Typing shows live
 * suggestions under the field; Enter (or the Buscar button) opens the full
 * results in /tienda. Escape, outside taps and picking a result close it.
 */
export const SearchBar: React.FC<SearchBarProps> = ({
  variant = "inline",
  placeholder = "Busca cuadernos, stickers, agendas…",
  className,
}) => {
  const router = useRouter();
  const rootRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const debouncedSearch = useDebounce(inputValue.trim(), 300);
  const hasQuery = debouncedSearch.length >= MIN_QUERY_LENGTH;
  const { data: products, status } = useSearchProducts(
    hasQuery ? debouncedSearch : "",
  );
  const { ref } = useInView();

  const close = useCallback(() => setIsOpen(false), []);

  const closeAll = useCallback(() => {
    setInputValue("");
    setIsOpen(false);
    inputRef.current?.blur();
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen, close]);

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
    setIsOpen(true);
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAll();
      }
    },
    [closeAll],
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const query = inputValue.trim();
      if (!query) {
        inputRef.current?.focus();
        return;
      }
      trackCustomerEvent("search", { search_term: query });
      setIsOpen(false);
      inputRef.current?.blur();
      router.push(
        `${STOREFRONT_ROUTES.shop}?search=${encodeURIComponent(query)}`,
      );
    },
    [inputValue, router],
  );

  const showResults = isOpen && hasQuery;
  const isDesktop = variant === "desktop";

  return (
    <form
      ref={rootRef}
      role="search"
      onSubmit={handleSubmit}
      className={cn("relative w-full", isDesktop && "max-w-[620px]", className)}
    >
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
          aria-expanded={showResults}
          aria-controls={showResults ? listboxId : undefined}
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
      {showResults ? (
        <SearchResults
          id={listboxId}
          innerRef={ref}
          products={(products as SearchResult[]) || []}
          isSuccess={status === "success"}
          isLoading={status === "pending"}
          isError={status === "error"}
          closeAll={closeAll}
          searchTerm={debouncedSearch}
        />
      ) : null}
    </form>
  );
};
