"use client";

import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs";
import { useMemo } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Category, Color, Design, Size, Type } from "@/types";

interface FilterProps {
  valueKey: string;
  name: string;
  emptyMessage?: string;
  data: (Type | Category | Size | Color | Design)[];
}

const Filter: React.FC<FilterProps> = ({
  valueKey,
  name,
  data,
  emptyMessage,
}) => {
  const [selectedValues, setSelectedValues] = useQueryState(
    valueKey,
    parseAsArrayOf(parseAsString)
      .withDefault([])
      .withOptions({ shallow: true }),
  );

  const parsedSelectedValues = useMemo(() => {
    return Array.isArray(selectedValues) ? selectedValues : [];
  }, [selectedValues]);

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const toggleFilter = (id: string) => {
    const current = new Set(parsedSelectedValues);
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    const newValue = Array.from(current);
    setSelectedValues(newValue.length > 0 ? newValue : null);
  };

  return (
    <Accordion type="single" collapsible defaultValue={name}>
      <AccordionItem value={name} className="border-none">
        <AccordionTrigger className="font-serif text-base font-semibold">
          {name}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col gap-3 pt-2">
            {sortedData?.length === 0 && (
              <div className="text-sm text-gray-500">{emptyMessage}</div>
            )}
            {!!sortedData?.length &&
              sortedData?.map((filter: any) => (
                <div key={filter.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`${valueKey}-${filter.id}`}
                    checked={parsedSelectedValues.includes(filter.id)}
                    onCheckedChange={() => toggleFilter(filter.id)}
                  />
                  <div className="flex items-center gap-x-2">
                    {valueKey === "colorId" && filter.value && (
                      <div
                        className="h-4 w-4 rounded-full border border-gray-600"
                        style={{ backgroundColor: filter.value }}
                      />
                    )}
                    <Label
                      htmlFor={`${valueKey}-${filter.id}`}
                      className="cursor-pointer text-sm font-medium capitalize leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {filter.name}
                      {filter.count !== undefined && (
                        <span className="ml-1 text-gray-500">
                          ({filter.count})
                        </span>
                      )}
                    </Label>
                  </div>
                </div>
              ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

export default Filter;
