"use client";

import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { useProductFilters } from "@/hooks/use-product-filters";
import { cn } from "@/lib/utils";

interface ShopSearchBarProps {
  className?: string;
}

const ShopSearchBar: React.FC<ShopSearchBarProps> = ({ className }) => {
  const { filters, setFilter } = useProductFilters();
  const [searchTerm, setSearchTerm] = useState<string>(filters.search || "");

  const debouncedSearch = useDebounce(searchTerm, 300);

  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  // Sync local state with URL filters when not focused
  useEffect(() => {
    if (
      document.activeElement !== inputRef.current &&
      filters.search !== searchTerm
    ) {
      setSearchTerm(filters.search || "");
    }
  }, [filters.search, searchTerm]);

  useEffect(() => {
    // Only update if the value is different to avoid loops
    // AND the component is visible (offsetParent is not null)
    // AND the input is focused (to ensure we only drive changes when active)
    if (
      debouncedSearch !== filters.search &&
      inputRef.current &&
      inputRef.current.offsetParent !== null
    ) {
      setFilter("search", debouncedSearch || null);
    }
  }, [debouncedSearch, filters.search, setFilter]);

  return (
    <div
      className={cn(
        "relative flex w-auto min-w-fit items-center gap-2 sm:w-44 md:w-52 lg:w-72",
        className,
      )}
    >
      <Search className="absolute left-2 h-5 w-5 text-blue-yankees" />
      <Input
        ref={inputRef}
        type="text"
        className="h-10 items-center border-blue-baby bg-background py-2 pl-9 pr-3 text-base"
        placeholder="Buscar un producto"
        value={searchTerm}
        onChange={handleSearchChange}
      />
    </div>
  );
};

export default ShopSearchBar;
