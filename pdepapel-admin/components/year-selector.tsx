"use client";

import { SearchParamSelector } from "@/components/search-param-selector";
import { START_YEAR } from "@/constants";

const currentYear = new Date().getFullYear();
const years = Array.from(
  { length: currentYear - START_YEAR + 1 },
  (_, i) => START_YEAR + i,
).sort((a, b) => b - a);

export const YearSelector: React.FC = () => {
  return (
    <SearchParamSelector
      paramKey="year"
      options={years.map(String)}
      placeholder="Año"
      defaultValue={new Date().getFullYear().toString()}
    />
  );
};
