"use client";

import qs from "query-string";
import { useEffect, useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SortOptions } from "@/constants";
import { XCircle } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Option = {
  value: SortOptions;
  label: string;
};

interface SortSelectorProps {
  options: Option[];
  isDisabled?: boolean;
}

const SortSelector: React.FC<SortSelectorProps> = ({
  options,
  isDisabled = false,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [selectedSortOption, setSelectedSortOption] = useState(
    searchParams.get("sortOption") || "",
  );

  useEffect(() => {
    const current = qs.parse(searchParams.toString());

    const query = {
      ...current,
      sortOption: selectedSortOption || undefined,
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
  }, [pathname, router, selectedSortOption]);

  const onSelectOption = (option: string) => {
    setSelectedSortOption(option);
  };

  const onClearSortOption = () => {
    setSelectedSortOption("");
  };

  return (
    <div className="flex w-auto min-w-fit items-center gap-2 sm:w-44 md:w-52 lg:w-64">
      {selectedSortOption && (
        <button onClick={onClearSortOption}>
          <XCircle className="h-6 w-6" />
        </button>
      )}
      <Select
        value={selectedSortOption || ""}
        defaultValue={selectedSortOption || ""}
        onValueChange={onSelectOption}
        disabled={isDisabled}
      >
        <SelectTrigger>
          <SelectValue placeholder="Ordernar productos" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              onClick={() => console.log("hey")}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default SortSelector;
