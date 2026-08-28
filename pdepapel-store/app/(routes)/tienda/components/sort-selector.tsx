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
        <button
          type="button"
          aria-label="Restablecer orden de productos"
          onClick={() => setFilter("sortOption", null)}
          className="inline-flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <XCircle className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
      <Select
        value={sortOption || ""}
        onValueChange={(value) => setFilter("sortOption", value)}
        disabled={isDisabled}
      >
        <SelectTrigger
          aria-label="Ordenar productos"
          className="h-11 touch-manipulation"
        >
          <SelectValue placeholder="Ordenar productos" />
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
