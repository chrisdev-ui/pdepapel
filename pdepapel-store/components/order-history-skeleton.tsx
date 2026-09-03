import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

interface OrderHistorySkeletonProps {
  count?: number;
}

/**
 * Placeholder that mirrors the order history layout (heading + order cards),
 * so the route transition and the client fetch show the same shape without a
 * layout shift or a second spinner.
 */
export function OrderHistorySkeleton({ count = 3 }: OrderHistorySkeletonProps) {
  return (
    <Container>
      <div
        role="status"
        aria-busy="true"
        aria-label="Cargando tus órdenes"
        className="space-y-10"
      >
        <Skeleton className="mx-auto h-8 w-56" />
        <div className="flex w-full flex-col gap-4">
          {Array.from({ length: count }, (_, index) => (
            <div
              key={index}
              className="rounded-lg border bg-card p-6 shadow-sm"
              aria-hidden="true"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-6 w-24" />
              </div>
              <div className="mt-4 flex flex-wrap justify-between gap-2">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="mt-6 h-11 w-full" />
            </div>
          ))}
        </div>
      </div>
    </Container>
  );
}
