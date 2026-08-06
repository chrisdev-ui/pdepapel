import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Container
      className="space-y-8 px-4 py-10 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Cargando página</span>
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-10 w-full max-w-2xl" />
      <Skeleton className="h-5 w-full max-w-3xl" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" />
        <div className="space-y-4 rounded-xl border p-5">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-11 w-full" />
        </div>
      </div>
    </Container>
  );
}
