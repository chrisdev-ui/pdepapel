"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import qs from "query-string";

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

export const Filter: React.FC<FilterProps> = ({
  valueKey,
  name,
  data,
  emptyMessage,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedValue = searchParams.get(valueKey);

  const handleSelected = (id: string) => {
    const current = qs.parse(searchParams.toString());

    const query = {
      ...current,
      [valueKey]: id,
    };

    if (current[valueKey] === id) {
      query[valueKey] = null;
    }

    const url = qs.stringifyUrl(
      {
        url: pathname,
        query,
      },
      { skipNull: true },
    );

    router.push(url);
  };

  return (
    <div className="mb-8">
      <h3 className="font-serif text-lg font-semibold">{name}</h3>
      <Separator className="my-4" />
      <div className="flex flex-wrap gap-2">
        {data?.length === 0 && (
          <div className="flex items-center">{emptyMessage}</div>
        )}
        {!!data?.length &&
          data?.map((filter) => (
            <div key={filter?.id} className="flex items-center">
              <Button
                className={cn(
                  "rounded-md border border-gray-300 bg-white p-2 text-sm text-gray-800 hover:bg-blue-yankees hover:text-white",
                  {
                    "bg-blue-yankees text-white": selectedValue === filter?.id,
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
