import dynamic from "next/dynamic";

import { Container } from "@/components/ui/container";
import {
  FilterSkeleton,
  ProductCardSkeleton,
  SortSelectorSkeleton,
} from "./components/skeletons";

const Newsletter = dynamic(() => import("@/components/newsletter"), {
  ssr: false,
});

const Features = dynamic(() => import("@/components/features"), { ssr: false });

export default function loading() {
  return (
    <>
      <Features />
      <Container className="flex flex-col gap-y-8">
        <div className="lg:grid lg:grid-cols-5 lg:gap-x-8">
          <div className="hidden lg:block">
            <FilterSkeleton name="Tipos" items={3} />
            <FilterSkeleton name="Categorías" items={3} />
            <FilterSkeleton name="Tamaños" items={3} />
            <FilterSkeleton name="Colores" items={3} />
            <FilterSkeleton name="Diseños" items={3} />
            <FilterSkeleton name="Precios" items={3} />
          </div>
          <div className="mt-6 space-y-5 lg:col-span-4 lg:mt-0 lg:space-y-0">
            <div className="mb-4 flex w-full items-center justify-between">
              <h2 className="font-serif text-3xl font-bold">
                Todos los productos
              </h2>
              <div className="flex items-center gap-4">
                <SortSelectorSkeleton />
                <SortSelectorSkeleton />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {Array(8)
                .fill(0)
                .map((_, index) => (
                  <ProductCardSkeleton key={`product_${index}`} />
                ))}
            </div>
          </div>
        </div>
      </Container>
      <Newsletter />
    </>
  );
}
