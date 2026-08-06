import { Skeleton } from "@/components/ui/skeleton";

export function RelatedProductsSkeleton() {
  return (
    <section aria-label="Cargando productos relacionados" className="space-y-4">
      <Skeleton className="h-9 w-72" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-xl border p-3">
            <Skeleton className="aspect-square w-full rounded-lg" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </section>
  );
}
