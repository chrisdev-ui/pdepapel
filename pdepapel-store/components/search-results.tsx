import { SearchItem } from "@/components/search-item";
import { SearchResult } from "@/types";
import { AlertTriangle } from "lucide-react";
import { SearchItemsSkeleton } from "./search-items-skeleton";
import { ScrollArea } from "./ui/scroll-area";

interface SearchResultsProps {
  id?: string;
  searchTerm?: string;
  products: SearchResult[];
  isSuccess?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  innerRef: React.Ref<HTMLAnchorElement>;
  closeAll: () => void;
}

export const SearchResults: React.FC<SearchResultsProps> = ({
  id,
  searchTerm,
  products,
  isSuccess,
  isLoading,
  isError,
  innerRef,
  closeAll,
}) => {
  return (
    <section
      id={id}
      aria-label={searchTerm ? `Resultados para ${searchTerm}` : "Resultados"}
      className="absolute inset-x-0 top-full z-20 mt-2 rounded-xl bg-white shadow-[0_16px_40px_rgba(34,27,65,0.18)] outline-none animate-in fade-in-0 zoom-in-95"
    >
      <ScrollArea className="max-h-[min(24rem,60vh)] overflow-y-auto overflow-x-hidden rounded-xl px-2 py-2.5 ring-1 ring-slate-200">
        {isLoading ? <SearchItemsSkeleton items={3} /> : null}
        {isError ? (
          <div className="flex w-full items-center justify-center gap-2.5 rounded p-2.5">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <span className="font-serif text-xs tracking-tight">
              Ha ocurrido un error mientras recuperabamos los productos.
            </span>
          </div>
        ) : null}
        {isSuccess && products.length > 0 ? (
          <div className="overflow-hidden p-1 text-blue-yankees">
            {products.map((product, index) => {
              return (
                <SearchItem
                  innerRef={
                    products.length === index + 1 ? innerRef : undefined
                  }
                  key={product.id}
                  closeAll={closeAll}
                  {...product}
                />
              );
            })}
          </div>
        ) : null}
        {isSuccess && products.length === 0 ? (
          <div className="flex w-full items-center justify-center rounded p-2.5">
            <span className="font-serif text-xs tracking-tight">
              No se encontraron resultados.
            </span>
          </div>
        ) : null}
      </ScrollArea>
    </section>
  );
};
