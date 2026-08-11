import { Skeleton } from "@/components/ui/skeleton";
import {
  KAWAII_FACE_EXCITED,
  KAWAII_FACE_HAPPY,
  LIMIT_PER_ITEMS,
} from "@/constants";

export const HeroSliderSkeleton: React.FC = () => (
  <section className="relative mx-auto w-full max-w-full overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
    <div className="kawaii-border relative aspect-[4/3] overflow-hidden rounded-2xl shadow-sm sm:aspect-[16/9] sm:rounded-3xl lg:aspect-[2.4/1]">
      <Skeleton className="h-full w-full" />
    </div>
  </section>
);

export const CategoryLinksSkeleton: React.FC = () => (
  <section className="mx-auto max-w-7xl px-6 py-12 sm:px-10">
    <div className="mx-auto max-w-2xl text-center">
      <Skeleton className="mx-auto h-9 w-64" />
      <Skeleton className="mx-auto mt-2 h-5 w-full max-w-xl" />
    </div>
    <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton key={index} className="aspect-square rounded-2xl" />
      ))}
    </div>
  </section>
);

export const FeaturedProductsSkeleton: React.FC = () => (
  <section className="mx-auto mt-8 max-w-screen-2xl p-4 sm:p-6 lg:p-8">
    <div className="flex flex-col gap-y-8">
      <div className="space-y-4 text-center">
        <h2 className="font-serif text-4xl font-extrabold">
          Productos destacados
        </h2>
        <p className="text-base text-blue-yankees/70">
          Los favoritos de nuestra colección, ¡no puedes perdértelos!{" "}
          {KAWAII_FACE_EXCITED}
        </p>
      </div>
      <HomeProductsContainerSkeleton />
    </div>
  </section>
);

export const NewArrivalsSkeleton: React.FC = () => (
  <section className="mx-auto mt-8 max-w-screen-2xl p-4 sm:p-6 lg:p-8">
    <div className="flex flex-col gap-y-8">
      <div className="space-y-4 text-center">
        <h2 className="font-serif text-4xl font-extrabold">
          Productos agregados recientemente
        </h2>
        <p className="text-base text-blue-yankees/70">
          ¡Descubre las últimas novedades en nuestra colección!{" "}
          {KAWAII_FACE_HAPPY}
        </p>
      </div>
      <HomeProductsContainerSkeleton />
    </div>
  </section>
);

const ProductCardSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col justify-between space-y-4 rounded-xl border border-solid border-blue-baby px-3 py-2.5 shadow-card">
      <div className="relative rounded-xl">
        <Skeleton className="aspect-square w-full rounded-md" />
      </div>
      <div className="flex flex-col gap-y-2.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-4 w-1/2" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-1/2" />
      </div>
    </div>
  );
};

export const HomeProductsContainerSkeleton: React.FC = () => (
  <div className="grid grid-cols-2 gap-1 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
    {Array.from({ length: LIMIT_PER_ITEMS }, (_, index) => (
      <ProductCardSkeleton key={index} />
    ))}
  </div>
);

export const MainBannerSkeleton: React.FC = () => (
  <section className="relative mx-0 my-10 flex w-full flex-col items-center justify-center space-y-3 overflow-hidden py-10 text-center xl:py-20">
    <Skeleton className="absolute inset-0 -z-10 h-full w-full rounded-none" />
    <Skeleton className="h-10 w-3/5 max-w-lg" />
    <Skeleton className="h-12 w-4/5 max-w-2xl" />
    <Skeleton className="h-[52px] w-28" />
  </section>
);

export const BannersCtaSkeleton: React.FC = () => (
  <section className="mx-auto max-w-screen-2xl p-4 sm:p-6 lg:p-8">
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {[...Array(2)].map((_, index) => (
        <div key={index} className="relative h-[22rem]">
          <Skeleton className="h-full w-full" />
        </div>
      ))}
    </div>
  </section>
);
