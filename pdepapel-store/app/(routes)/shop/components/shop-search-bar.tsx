"use client";

import { Search } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

interface ShopSearchBarProps {
  className?: string;
}

const ShopSearchBar: React.FC<ShopSearchBarProps> = ({ className }) => {
  const [query, setQuery] = useQueryState(
    "search",
    parseAsString.withDefault("").withOptions({ shallow: true }),
  );
  const [searchTerm, setSearchTerm] = useState<string>(query);

  const debouncedSearch = useDebounce(searchTerm, 300);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  useEffect(() => {
    setQuery(debouncedSearch || null);
  }, [debouncedSearch, setQuery]);

  return (
    <div
      className={cn(
        "relative flex w-auto min-w-fit items-center gap-2 sm:w-44 md:w-52 lg:w-72",
        className,
      )}
    >
      <Search className="absolute left-2 h-5 w-5 text-blue-yankees" />
      <Input
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
