import { Skeleton } from "@/components/ui/skeleton";

const wrap = "mx-auto flex max-w-screen-2xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8 lg:py-8";

export function ProductRowSkeleton({ count = 4, rows = 2 }: { count?: number; rows?: number }) {
  return (
    <div className={wrap} aria-hidden="true">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: count * rows }, (_, index) => (
          <div key={index} className="flex flex-col gap-2 rounded-xl border border-blue-baby p-2 sm:p-3">
            <Skeleton className="aspect-square w-full rounded-xl" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function RailSkeleton({ count = 6, tile = "h-40 w-40" }: { count?: number; tile?: string }) {
  return (
    <div className={wrap} aria-hidden="true">
      <Skeleton className="h-8 w-56" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: count }, (_, index) => (
          <Skeleton key={index} className={`shrink-0 rounded-2xl ${tile}`} />
        ))}
      </div>
    </div>
  );
}

export function BannerSkeleton() {
  return (
    <div className="mx-auto max-w-screen-2xl px-4 py-4 sm:px-6 lg:px-8 lg:py-6" aria-hidden="true">
      <Skeleton className="h-64 w-full rounded-2xl lg:h-72" />
    </div>
  );
}
