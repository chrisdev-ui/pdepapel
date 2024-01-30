"use client";

import { Search, X } from "lucide-react";
import {
  ChangeEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useInView } from "react-intersection-observer";

import { SearchResults } from "@/components/search-results";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import useFilteredProducts from "@/hooks/use-filtered-products";
import { cn } from "@/lib/utils";
import { Product } from "@/types";

interface SearchBarProps {
  displaySearchbox: boolean;
  toggleSearch: (open: boolean) => void;
  className?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  displaySearchbox,
  toggleSearch,
  className,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const [inputValue, setInputValue] = useState<string>("");
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const debouncedSearch = useDebounce(inputValue, 300);

  const { ref, inView } = useInView();

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setInputValue(event.target.value);
    },
    [],
  );

  const {
    data: filteredProducts,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status,
  } = useFilteredProducts(debouncedSearch);

  const products = filteredProducts?.pages.flat();

  const handleKeydown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      const input = inputRef.current;

      if (!input) {
        return;
      }

      if (!isOpen) {
        setIsOpen(true);
      }

      if (event.key === "Escape") {
        setIsOpen(false);
        toggleSearch(false);
        input.blur();
      }
    },
    [isOpen, toggleSearch],
  );

  const handleBlur = useCallback(() => {
    if (!isOpen) {
      toggleSearch(false);
    } else if (isOpen && inputValue === "" && products?.length === 0) {
      setIsOpen(false);
      toggleSearch(false);
    }
  }, [products?.length, inputValue, isOpen, toggleSearch]);

  const closeAll = useCallback(() => {
    setInputValue("");
    setIsOpen(false);
    toggleSearch(false);
  }, [toggleSearch]);

  useEffect(() => {
    if (inView && hasNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, inView]);

  return (
    <div className="relative">
      <div
        className={cn(
          "relative w-[3.75rem] max-w-[3.75rem] rounded-[6px] bg-white py-2 transition-all duration-500 ease-in-out lg:px-2 xl:px-4",
          {
            "mr-10 w-[14rem] max-w-[14rem] md:w-[28rem] md:max-w-md lg:w-80 lg:max-w-xs xl:w-[28rem] xl:max-w-md":
              displaySearchbox,
          },
          className,
        )}
        onKeyDown={handleKeydown}
      >
        <Input
          ref={inputRef}
          type="text"
          className={cn(
            "relative h-full w-full rounded-[6px] border-none px-4 py-0 text-base font-normal text-blue-yankees shadow-none outline-none transition-all duration-500 ease-in-out focus-visible:outline-0 focus-visible:ring-0 focus-visible:ring-inherit focus-visible:ring-offset-0 focus-visible:ring-offset-transparent",
            {
              "py-0 pl-16 pr-4 lg:pl-14": displaySearchbox,
            },
          )}
          placeholder="Buscar un producto"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onBlur={handleBlur}
        />

        <button
          className={cn(
            "absolute left-0 top-0 flex h-full w-[3.75rem] cursor-pointer items-center justify-center rounded-[6px] bg-white",
            {
              "rounded-[6px_0_0_6px]": displaySearchbox,
            },
          )}
          onClick={() => {
            toggleSearch(true);
          }}
        >
          <Search className="h-5 w-5" />
        </button>
        <X
          className={cn(
            "pointer-events-none absolute -right-[45px] top-1/2 h-8 w-8 -translate-y-1/2 transform cursor-pointer p-[5px] text-blue-yankees opacity-0 transition-all duration-500 ease-in-out",
            {
              "pointer-events-auto -translate-y-1/2 rotate-180 opacity-100":
                displaySearchbox,
            },
          )}
          onClick={closeAll}
        />
      </div>
      {displaySearchbox && isOpen ? (
        <SearchResults
          innerRef={ref}
          products={products as Product[]}
          isSuccess={status === "success"}
          isLoading={status === "pending"}
          isError={status === "error"}
          isFetchingNextPage={isFetchingNextPage}
          hasNextPage={hasNextPage}
          closeAll={closeAll}
        />
      ) : null}
    </div>
  );
};
