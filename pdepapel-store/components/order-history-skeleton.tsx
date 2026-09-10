import { Skeleton } from "@/components/ui/skeleton";

interface OrderHistorySkeletonProps {
  count?: number;
}

/**
 * Placeholder that mirrors the order history layout (header band, filter
 * pills and order cards), so the route transition and the client fetch show
 * the same shape without a layout shift or a second spinner.
 */
export function OrderHistorySkeleton({ count = 3 }: OrderHistorySkeletonProps) {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando tus órdenes">
      <div className="bg-kawaii-pink-light/15 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <div className="mx-auto flex max-w-screen-2xl flex-col gap-3">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
      </div>
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
        </div>
        <div className="flex flex-col gap-3">
          {Array.from({ length: count }, (_, index) => (
            <div
              key={index}
              aria-hidden="true"
              className="grid gap-4 rounded-2xl border border-pink-shell/30 bg-white p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-5"
            >
              <Skeleton className="hidden h-12 w-24 rounded-lg sm:block" />
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-36" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
                <Skeleton className="h-4 w-56 max-w-full" />
              </div>
              <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-9 w-28 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
