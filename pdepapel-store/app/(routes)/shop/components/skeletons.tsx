import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export const FilterSkeleton: React.FC<{ name: string; items: number }> = ({
  name,
  items,
}) => {
  return (
    <div className="mb-8">
      <h3 className="font-serif text-lg font-semibold">{name}</h3>
      <Separator className="my-4" />
      <div className="flex flex-wrap gap-2">
        {Array(items)
          .fill(0)
          .map((_, index) => (
            <div key={`filter-${index}`} className="flex items-center">
              <div className="rounded-md border border-gray-300 bg-white p-4">
                <Skeleton className="h-2 w-10" />
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};

export const SortSelectorSkeleton: React.FC = () => {
  return (
    <div className="flex w-auto min-w-fit items-center gap-2 sm:w-44 md:w-52 lg:w-64">
      <div className="flex h-10 w-full items-center justify-between rounded-md border border-white-rock bg-background px-3 py-2 text-sm">
        <Skeleton className="h-2 w-full" />
      </div>
    </div>
  );
};

export const ProductCardSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col justify-between space-y-4 rounded-xl border border-solid border-white-rock px-3 py-2.5 shadow-card">
      <div className="relative aspect-square rounded-xl">
        <Skeleton className="aspect-square h-[254.8px] w-full rounded-md object-cover" />
      </div>
      <div className="flex flex-col gap-y-2.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-4 w-1/2" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-1/2" />
      </div>
    </div>
  );
};
