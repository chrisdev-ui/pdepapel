import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { KAWAII_FACE_EXCITED, KAWAII_FACE_HAPPY } from "@/constants";

export const HeroSliderSkeleton: React.FC = () => (
  <section className="mx-auto my-0 overflow-hidden rounded-xl p-4 sm:p-6 lg:p-8">
    <div className="overflow-hidden">
      <div className="whitespace-nowrap">
        <div className="relative inline-block aspect-square w-full overflow-hidden rounded-xl md:aspect-[2.4/1]">
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    </div>
    <div className="text-center">
      {[...Array(3)].map((_, index) => (
        <Skeleton
          key={index}
          className="mx-2 mb-0 mt-4 inline-block h-3 w-3 rounded-full xl:h-5 xl:w-5"
        />
      ))}
    </div>
  </section>
);

export const FeaturedProductsSkeleton: React.FC = () => (
  <Container component="section" className="mt-8 flex flex-col gap-y-8">
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
  </Container>
);

export const NewArrivalsSkeleton: React.FC = () => (
  <Container component="section" className="mt-8 flex flex-col gap-y-8">
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
  </Container>
);

const ProductCardSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col justify-between space-y-4 rounded-xl border border-solid border-white-rock px-3 py-2.5 shadow-card">
      <div className="relative rounded-xl">
        <Skeleton className="aspect-square h-[254.8px] w-full rounded-md object-cover" />
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
    {[...Array(4)].map((_, index) => (
      <ProductCardSkeleton key={index} />
    ))}
  </div>
);

export const MainBannerSkeleton: React.FC = () => (
  <div className="relative h-96 w-full overflow-hidden rounded-xl">
    <Skeleton className="h-full w-full" />
  </div>
);

export const BannersCtaSkeleton: React.FC = () => (
  <Container component="section">
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {[...Array(2)].map((_, index) => (
        <div key={index} className="relative h-40 sm:h-60 md:h-80">
          <Skeleton className="h-full w-full" />
        </div>
      ))}
    </div>
  </Container>
);
