"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { START_YEAR } from "@/constants";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const currentYear = new Date().getFullYear();
const years = Array.from(
  { length: currentYear - START_YEAR + 1 },
  (_, i) => START_YEAR + i,
).sort((a, b) => b - a);

export function YearSelector({ selected }: { selected: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const onYearChange = (value: string) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()));

    if (!value) {
      current.delete("year");
    } else {
      current.set("year", value);
    }

    const search = current.toString();
    const query = search ? `?${search}` : "";

    router.push(`${pathname}${query}`);
  };

  return (
    <Select onValueChange={onYearChange} value={selected}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Selecciona un año" />
      </SelectTrigger>
      <SelectContent>
        {years.map((year) => (
          <SelectItem key={year} value={year.toString()}>
            {year}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
