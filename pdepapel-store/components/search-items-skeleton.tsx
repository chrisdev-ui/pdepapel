import { Skeleton } from "@/components/ui/skeleton";

interface SearchItemsSkeletonProps {
  items: number;
}

export const SearchItemsSkeleton: React.FC<SearchItemsSkeletonProps> = ({
  items,
}) => {
  return Array(items)
    .fill(0)
    .map((_, index) => (
      <div
        key={index}
        className="grid grid-cols-[40px_1fr] gap-2.5 rounded p-1"
      >
        <Skeleton className="h-10 w-10" />
        <div className="flex max-h-10 grow items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-14" />
        </div>
      </div>
    ));
};
