"use client";

import { useQueryState } from "nuqs";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SortOptions } from "@/constants";
import { XCircle } from "lucide-react";

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
  const [sortOption, setSortOption] = useQueryState("sortOption");

  return (
    <div className="flex w-full min-w-full items-center gap-2 sm:w-44 sm:min-w-fit md:w-52 lg:w-64">
      {sortOption && (
        <button onClick={() => setSortOption(null)}>
          <XCircle className="h-6 w-6" />
        </button>
      )}
      <Select
        value={sortOption || ""}
        onValueChange={(value) => setSortOption(value)}
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
