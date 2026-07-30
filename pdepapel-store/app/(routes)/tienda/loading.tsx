import dynamic from "next/dynamic";

import { Container } from "@/components/ui/container";
import {
  FilterSkeleton,
  MobileFiltersSkeleton,
  ProductsContainerSkeleton,
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
            <FilterSkeleton name="Categorías" items={3} />
            <FilterSkeleton name="Sub-Categorías" items={3} />
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
              <section className="flex w-full items-center gap-4 md:w-auto">
                <SortSelectorSkeleton />
                <SortSelectorSkeleton />
              </section>
            </div>
            <MobileFiltersSkeleton />
            <div className="flex w-full md:hidden">
              <SortSelectorSkeleton />
            </div>
            <ProductsContainerSkeleton />
          </div>
        </div>
      </Container>
      <Newsletter />
    </>
  );
}
