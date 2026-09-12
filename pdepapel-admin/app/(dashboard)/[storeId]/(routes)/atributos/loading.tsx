import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto del hub de Atributos: encabezado, pestañas y tabla. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8 sm:pt-6" aria-busy="true" aria-label="Cargando atributos">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <Skeleton className="h-10 w-40 rounded-md" />
      </div>
      <div className="flex max-w-full gap-1 overflow-hidden rounded-full border bg-white p-1">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-28 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-4 w-full max-w-lg" />
          <Skeleton className="h-8 w-44 rounded-full" />
        </div>
        <div className="flex flex-col gap-2 rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-9 w-28" />
          </div>
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
