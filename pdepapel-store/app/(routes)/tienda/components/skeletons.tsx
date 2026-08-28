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
    <div className="flex w-full min-w-full items-center gap-2 sm:w-44 sm:min-w-fit md:w-52 lg:w-64">
      <div className="flex h-10 w-full items-center justify-between rounded-md border border-blue-baby bg-background px-3 py-2 text-sm">
        <Skeleton className="h-2 w-full" />
      </div>
    </div>
  );
};

export const ProductCardSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col justify-between space-y-4 rounded-xl border border-solid border-blue-baby px-3 py-2.5 shadow-card">
      <div className="relative aspect-square rounded-xl">
        <Skeleton className="aspect-square w-full rounded-md" />
      </div>
      <div className="flex min-h-[4.5rem] flex-col gap-y-2.5">
        <Skeleton className="h-7 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-4 w-1/2" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-1/2" />
      </div>
    </div>
  );
};

export const ProductsContainerSkeleton: React.FC = () => (
  <>
    <div className="grid grid-cols-2 gap-1 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {Array(8)
        .fill(0)
        .map((_, index) => (
          <ProductCardSkeleton key={`product_${index}`} />
        ))}
    </div>
    <PaginatorSkeleton />
  </>
);

export const ProductListSkeleton = ProductsContainerSkeleton;

export const PaginatorSkeleton: React.FC = () => {
  return (
    <div className="flex w-full items-center justify-center gap-4">
      <Skeleton className="h-10 w-10" />
      <Skeleton className="h-10 w-10" />
      <Skeleton className="h-10 w-10" />
      <Skeleton className="h-10 w-10" />
    </div>
  );
};

export const MobileFiltersSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col gap-4 lg:hidden">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-16" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-16" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-16" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-16" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-16" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-16" />
      </div>
    </div>
  );
};

interface ShopContentSkeletonProps {
  heading?: string;
  fixedCategory?: boolean;
}

export const ShopContentSkeleton: React.FC<ShopContentSkeletonProps> = ({
  heading = "Todos los productos",
  fixedCategory = false,
}) => {
  return (
    <div className="lg:grid lg:grid-cols-5 lg:gap-x-8">
      <div className="hidden lg:block">
        {!fixedCategory && <FilterSkeleton name="Categorías" items={3} />}
        {!fixedCategory && <FilterSkeleton name="Sub-Categorías" items={3} />}
        <FilterSkeleton name="Tamaños" items={3} />
        <FilterSkeleton name="Colores" items={3} />
        <FilterSkeleton name="Diseños" items={3} />
        <FilterSkeleton name="Precios" items={3} />
      </div>
      <div className="mt-6 space-y-5 lg:col-span-4 lg:mt-0 lg:space-y-0">
        <div className="mb-4 flex w-full flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <h2 className="font-serif text-3xl font-bold">{heading}</h2>
          <section className="flex w-full flex-col gap-2 lg:w-auto lg:items-end">
            <div className="flex w-full items-center gap-2 md:justify-end md:gap-4 lg:w-auto">
              <div className="hidden md:block">
                <SortSelectorSkeleton />
              </div>
              <SortSelectorSkeleton />
            </div>
            <Skeleton className="h-12 w-full rounded-lg md:h-11 md:w-44" />
          </section>
        </div>
        <MobileFiltersSkeleton />
        <div className="flex w-full md:hidden">
          <SortSelectorSkeleton />
        </div>
        <ProductsContainerSkeleton />
      </div>
    </div>
  );
};
