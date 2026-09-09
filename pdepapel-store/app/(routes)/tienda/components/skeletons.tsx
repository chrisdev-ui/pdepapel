import { Skeleton } from "@/components/ui/skeleton";

/** Misma anatomía que `product-card.tsx`, bloque por bloque, para que no salte nada al cargar. */
export const ProductCardSkeleton: React.FC = () => (
  <div className="flex flex-col gap-2 rounded-xl border border-blue-baby bg-white p-2 sm:p-3" aria-hidden="true">
    <Skeleton className="aspect-square w-full rounded-xl" />
    <div className="flex flex-col gap-1.5 pt-1">
      <Skeleton className="h-[2.7em] w-11/12 text-[15px] sm:text-[17px]" />
      <Skeleton className="h-4 w-1/2" />
      <div className="h-[22px]" />
      <div className="flex h-12 items-center justify-between">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-9 w-9 rounded-full sm:h-10 sm:w-10" />
      </div>
    </div>
  </div>
);

export const ProductGridSkeleton: React.FC<{ count?: number }> = ({ count = 8 }) => (
  <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
    {Array.from({ length: count }, (_, index) => (
      <ProductCardSkeleton key={index} />
    ))}
  </div>
);

export const ProductListSkeleton: React.FC = () => (
  <div className="flex flex-col gap-8">
    <ProductGridSkeleton />
    <div className="flex flex-col items-center gap-2.5">
      <div className="flex items-center gap-1.5">
        <Skeleton className="h-10 w-24 rounded-full" />
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-10 rounded-full" />
        ))}
        <Skeleton className="h-10 w-24 rounded-full" />
      </div>
      <Skeleton className="h-4 w-56" />
    </div>
  </div>
);

const FilterGroupSkeleton: React.FC<{ rows?: number }> = ({ rows = 0 }) => (
  <div className="border-b border-border py-3">
    <div className="flex h-9 items-center justify-between">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-4 w-4" />
    </div>
    {rows > 0 && (
      <div className="flex flex-col gap-1 pt-1">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex h-9 items-center gap-2.5">
            <Skeleton className="h-[18px] w-[18px] rounded-[5px]" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-3 w-6" />
          </div>
        ))}
      </div>
    )}
  </div>
);

export const SidebarSkeleton: React.FC<{ fixedCategory?: boolean }> = ({ fixedCategory = false }) => (
  <div className="hidden lg:block" aria-hidden="true">
    <div className="flex h-10 items-center">
      <Skeleton className="h-5 w-24" />
    </div>
    <div className="flex min-h-11 items-center justify-between border-b border-border">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-5 w-9 rounded-full" />
    </div>
    {!fixedCategory && <FilterGroupSkeleton rows={6} />}
    {!fixedCategory && <FilterGroupSkeleton />}
    <FilterGroupSkeleton rows={0} />
    <FilterGroupSkeleton />
    <FilterGroupSkeleton />
  </div>
);

export const ToolbarSkeleton: React.FC = () => (
  <>
    <div className="flex gap-2 lg:hidden" aria-hidden="true">
      <Skeleton className="h-11 flex-1 rounded-full" />
      <Skeleton className="h-11 flex-1 rounded-full" />
    </div>
    <div className="hidden min-h-11 items-center justify-between lg:flex" aria-hidden="true">
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-10 w-52 rounded-full" />
    </div>
  </>
);

export const PageHeaderSkeleton: React.FC = () => (
  <div className="flex items-center gap-4 rounded-2xl bg-kawaii-lavender-light/60 px-4 py-5 sm:px-6 lg:gap-10 lg:rounded-3xl lg:px-10 lg:py-8" aria-hidden="true">
    <div className="flex flex-1 flex-col gap-3">
      <Skeleton className="h-3 w-28" />
      <div className="flex items-center gap-3.5">
        <Skeleton className="h-9 w-56 lg:h-11 lg:w-80" />
        <Skeleton className="h-8 w-28 rounded-full lg:h-9" />
      </div>
      <Skeleton className="h-4 w-full max-w-[52ch]" />
      <Skeleton className="hidden h-4 w-2/3 lg:block" />
    </div>
    <Skeleton className="h-24 w-24 shrink-0 rounded-full lg:h-[200px] lg:w-[200px]" />
  </div>
);

interface ShopContentSkeletonProps {
  fixedCategory?: boolean;
}

export const ShopContentSkeleton: React.FC<ShopContentSkeletonProps> = ({ fixedCategory = false }) => (
  <div className="lg:grid lg:grid-cols-[264px_minmax(0,1fr)] lg:gap-10">
    <SidebarSkeleton fixedCategory={fixedCategory} />
    <div className="flex flex-col gap-5">
      <ToolbarSkeleton />
      <ProductListSkeleton />
    </div>
  </div>
);
