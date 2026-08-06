import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function CheckoutLoading() {
  return (
    <Container
      className="space-y-8 py-8"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Cargando finalizar compra</span>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-9 w-44" />
      </div>
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Skeleton className="h-8 w-48" />
          <div className="space-y-4 rounded-xl border p-6">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-11 w-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4 rounded-xl border p-6">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </Container>
  );
}
