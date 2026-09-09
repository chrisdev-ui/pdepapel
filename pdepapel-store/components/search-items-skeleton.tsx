import { Skeleton } from "@/components/ui/skeleton";

interface SearchItemsSkeletonProps {
  items: number;
}

/** Filas de 56 px, como los resultados, para que el desplegable no salte al llegar los datos. */
export const SearchItemsSkeleton: React.FC<SearchItemsSkeletonProps> = ({ items }) => (
  <ul aria-hidden="true" className="flex flex-col">
    {Array.from({ length: items }, (_, index) => (
      <li key={index} className="grid min-h-14 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 px-2.5 py-1.5">
        <Skeleton className="h-11 w-11 rounded-[10px]" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <Skeleton className="h-3.5 w-14" />
      </li>
    ))}
  </ul>
);
