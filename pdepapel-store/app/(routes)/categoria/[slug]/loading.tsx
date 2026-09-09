import { PageHeaderSkeleton, ShopContentSkeleton } from "@/app/(routes)/tienda/components/skeletons";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function CategoryLoading() {
  return (
    <Container className="flex flex-col gap-y-4 px-4 pb-12 pt-2 sm:px-6 lg:gap-y-5 lg:px-8 lg:pt-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando categoría</span>
      <div className="flex gap-2 py-2.5 lg:hidden" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-11 w-28 shrink-0 rounded-full" />
        ))}
      </div>
      <Skeleton className="h-4 w-48" />
      <PageHeaderSkeleton />
      <ShopContentSkeleton fixedCategory />
    </Container>
  );
}
