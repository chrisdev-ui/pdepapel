import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function OrderLoading() {
  return (
    <Container
      className="space-y-8 px-4 py-8 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Cargando pedido</span>
      <Skeleton className="h-4 w-56" />
      <section className="space-y-5 rounded-2xl border p-8 text-center">
        <Skeleton className="mx-auto h-24 w-24 rounded-full" />
        <Skeleton className="mx-auto h-10 w-3/4 max-w-xl" />
        <Skeleton className="mx-auto h-5 w-full max-w-2xl" />
        <Skeleton className="mx-auto h-10 w-40" />
      </section>
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    </Container>
  );
}
