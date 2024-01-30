import { SearchItem } from "@/components/search-item";
import { Product } from "@/types";
import { AlertTriangle } from "lucide-react";
import { SearchItemsSkeleton } from "./search-items-skeleton";
import { ScrollArea } from "./ui/scroll-area";

interface SearchResultsProps {
  products: Product[];
  isSuccess?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  innerRef: React.Ref<HTMLAnchorElement>;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  closeAll: () => void;
}

export const SearchResults: React.FC<SearchResultsProps> = ({
  products,
  isSuccess,
  isLoading,
  isError,
  innerRef,
  isFetchingNextPage,
  hasNextPage,
  closeAll,
}) => {
  return (
    <section className="absolute -left-10 z-10 mt-1 w-80 max-w-xs rounded-[6px] bg-white outline-none animate-in fade-in-0 zoom-in-95 xs:left-auto md:left-auto md:w-[28rem] md:max-w-md">
      <ScrollArea className="max-h-96 overflow-y-auto overflow-x-hidden rounded px-2 py-2.5 ring-1 ring-slate-200">
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
                  image={product.images[0]}
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
        {isFetchingNextPage && hasNextPage ? (
          <SearchItemsSkeleton items={3} />
        ) : null}
        {!hasNextPage ? (
          <div className="flex w-full items-center justify-center rounded p-2.5">
            <span className="font-serif text-xs tracking-tight">
              No hay más resultados.
            </span>
          </div>
        ) : null}
      </ScrollArea>
    </section>
  );
};
