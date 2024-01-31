"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import qs from "query-string";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

interface ShopSearchBarProps {
  className?: string;
}

const ShopSearchBar: React.FC<ShopSearchBarProps> = ({ className }) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchTerm, setSearchTerm] = useState<string>(
    searchParams.get("search") || "",
  );

  const debouncedSearch = useDebounce(searchTerm, 300);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  useEffect(() => {
    const current = qs.parse(searchParams.toString());

    const query = {
      ...current,
      search: debouncedSearch || undefined,
    };

    const url = qs.stringifyUrl(
      {
        url: pathname,
        query,
      },
      { skipNull: true, skipEmptyString: true },
    );

    router.push(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, pathname, router]);

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
        className="h-10 items-center border-white-rock bg-background py-2 pl-9 pr-3 text-base"
        placeholder="Buscar un producto"
        value={searchTerm}
        onChange={handleSearchChange}
      />
    </div>
  );
};

export default ShopSearchBar;
