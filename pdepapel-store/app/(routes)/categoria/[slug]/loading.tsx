import { ShopContentSkeleton } from "@/app/(routes)/tienda/components/skeletons";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function CategoryLoading() {
  return (
    <Container
      className="space-y-8 px-4 py-6 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Cargando categoría</span>
      <Skeleton className="h-4 w-48" />
      <section className="max-w-3xl space-y-3">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-5 w-full" />
      </section>
      <ShopContentSkeleton
        heading="Productos de la categoría"
        fixedCategory
      />
    </Container>
  );
}
