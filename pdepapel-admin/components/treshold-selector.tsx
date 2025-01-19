import { SearchParamSelector } from "@/components/search-param-selector";
import { TRESHOLD_LOW_STOCK } from "@/constants";

export const TresholdSelector: React.FC = () => {
  return (
    <SearchParamSelector
      paramKey="treshold"
      options={Array.from({ length: 10 }, (_, i) => (i + 1).toString())}
      placeholder="Selecciona un mínimo de stock"
      defaultValue={TRESHOLD_LOW_STOCK.toString()}
    />
  );
};
