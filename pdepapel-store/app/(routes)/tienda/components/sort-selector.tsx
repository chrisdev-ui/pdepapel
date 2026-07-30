"use client";

import { SortOptions } from "@/constants";
import { useProductFilters } from "@/hooks/use-product-filters";
import { XCircle } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const { filters, setFilter } = useProductFilters();
  const sortOption = filters.sortOption;

  return (
    <div className="flex w-full min-w-full items-center gap-2 sm:w-44 sm:min-w-fit md:w-52 lg:w-64">
      {sortOption && (
        <button onClick={() => setFilter("sortOption", null)}>
          <XCircle className="h-6 w-6" />
        </button>
      )}
      <Select
        value={sortOption || ""}
        onValueChange={(value) => setFilter("sortOption", value)}
        disabled={isDisabled}
      >
        <SelectTrigger>
          <SelectValue placeholder="Ordernar productos" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default SortSelector;
