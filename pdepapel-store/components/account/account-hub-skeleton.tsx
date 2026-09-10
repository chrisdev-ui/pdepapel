import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the account hub layout: header band + six tiles. */
export function AccountHubSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando tu cuenta">
      <div className="bg-kawaii-pink-light/15 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <div className="mx-auto flex max-w-screen-2xl items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
        </div>
      </div>
      <div className="mx-auto grid max-w-screen-2xl gap-4 px-4 py-6 sm:grid-cols-2 sm:px-6 lg:px-8 lg:py-8 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            aria-hidden="true"
            className="flex flex-col gap-3 rounded-2xl border border-pink-shell/30 bg-white p-5"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <Skeleton className="h-5 w-36" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-9 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
