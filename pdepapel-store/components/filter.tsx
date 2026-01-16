"use client";

import { ChevronsDown, ChevronsUp, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { ProductFilters, useProductFilters } from "@/hooks/use-product-filters";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LIMIT } from "@/constants";
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
  const { filters, toggleFilter, setFilter } = useProductFilters();

  const parsedSelectedValues = useMemo(() => {
    const values = filters[valueKey as keyof ProductFilters];
    return Array.isArray(values) ? values : [];
  }, [filters, valueKey]);

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const handleToggleFilter = (id: string) => {
    toggleFilter(valueKey as keyof ProductFilters, id);
  };

  const [showAll, setShowAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredData = useMemo(() => {
    if (!searchQuery) return sortedData;
    return sortedData.filter((item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [sortedData, searchQuery]);

  const visibleData = useMemo(() => {
    if (showAll || searchQuery) {
      return filteredData;
    }
    return filteredData.slice(0, LIMIT);
  }, [filteredData, showAll, searchQuery]);

  const activeCount = parsedSelectedValues.length;

  return (
    <Accordion type="single" collapsible defaultValue={name}>
      <AccordionItem value={name} className="border-none">
        <AccordionTrigger className="font-serif text-base font-semibold">
          <span className="flex items-center gap-2">
            {name}
            {activeCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-pink-100 text-xs font-bold text-pink-600">
                {activeCount}
              </span>
            )}
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col gap-3 pt-2">
            {/* Header Actions: Search & Clear */}
            <div className="flex flex-col gap-2">
              {sortedData.length > LIMIT && (
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={`Buscar ${name.toLowerCase()}...`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 pl-8 text-sm"
                  />
                </div>
              )}
              {activeCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto w-fit self-end px-2 py-1 text-xs text-muted-foreground hover:text-red-500"
                  onClick={() =>
                    setFilter(valueKey as keyof ProductFilters, null)
                  }
                >
                  Limpiar filtros
                  <X className="ml-1 h-3 w-3" />
                </Button>
              )}
            </div>

            {filteredData.length === 0 && (
              <div className="text-sm text-gray-500">
                {searchQuery ? "No se encontraron resultados" : emptyMessage}
              </div>
            )}
            {!!visibleData?.length &&
              visibleData?.map((filter: any) => (
                <div key={filter.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`${valueKey}-${filter.id}`}
                    checked={parsedSelectedValues.includes(filter.id)}
                    onCheckedChange={() => handleToggleFilter(filter.id)}
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
            {/* Only show View More if not searching and we have more data than limit */}
            {!searchQuery && filteredData.length > LIMIT && (
              <Button
                variant="link"
                size="sm"
                className="group h-auto w-fit p-0 text-base font-normal text-pink-froly no-underline transition-none hover:no-underline"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? (
                  <>
                    Ver menos
                    <ChevronsUp className="ml-1 h-4 w-4 lg:group-hover:animate-bounce" />
                  </>
                ) : (
                  <>
                    Ver más ({filteredData.length - LIMIT})
                    <ChevronsDown className="ml-1 h-4 w-4 lg:group-hover:animate-bounce" />
                  </>
                )}
              </Button>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

export default Filter;
