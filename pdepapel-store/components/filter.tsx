"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import qs from "query-string";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Category, Color, Design, PriceRange, Size, Type } from "@/types";

interface FilterProps {
  valueKey: string;
  name: string;
  emptyMessage?: string;
  data: (Type | Category | Size | Color | Design | PriceRange)[];
}

const Filter: React.FC<FilterProps> = ({
  valueKey,
  name,
  data,
  emptyMessage,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedValue = searchParams.get(valueKey);

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const [selectedValues, setSelectedValues] = useState(new Set());

  const handleSelected = (id: string) => {
    setSelectedValues((prevValues) => {
      const newValues = new Set(prevValues);
      if (newValues.has(id)) {
        newValues.delete(id);
      } else {
        newValues.add(id);
      }
      return newValues;
    });
  };

  useEffect(() => {
    const current = qs.parse(searchParams.toString(), { arrayFormat: "comma" });

    delete current.page;

    const query = {
      ...current,
      [valueKey]: Array.from(selectedValues).map(String),
    };

    const url = qs.stringifyUrl(
      {
        url: pathname,
        query,
      },
      { skipNull: true, arrayFormat: "comma" },
    );

    router.push(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedValues]);

  return (
    <div className="mb-8">
      <h3 className="font-serif text-lg font-semibold">{name}</h3>
      <Separator className="my-4" />
      <div className="flex flex-wrap gap-2">
        {sortedData?.length === 0 && (
          <div className="flex items-center">{emptyMessage}</div>
        )}
        {!!sortedData?.length &&
          sortedData?.map((filter) => (
            <div key={filter?.id} className="flex items-center">
              <Button
                className={cn(
                  "rounded-md border border-gray-300 bg-white p-2 text-sm text-gray-800 hover:bg-blue-baby hover:text-white",
                  {
                    "bg-blue-baby text-white": selectedValue?.includes(
                      filter?.id,
                    ),
                  },
                )}
                onClick={() => handleSelected(filter?.id)}
              >
                {filter?.name}
              </Button>
            </div>
          ))}
      </div>
    </div>
  );
};

export default Filter;
