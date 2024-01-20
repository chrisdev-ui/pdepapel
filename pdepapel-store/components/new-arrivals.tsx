"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

import { Loader } from "@/components/loader";
import { Container } from "@/components/ui/container";
import { NoResults } from "@/components/ui/no-results";
import ProductCard from "@/components/ui/product-card";
import { KAWAII_FACE_HAPPY, KAWAII_FACE_SAD } from "@/constants";
import { Product } from "@/types";

interface NewArrivalsProps {
  newProducts: Product[];
}

const NewArrivals: React.FC<NewArrivalsProps> = ({ newProducts }) => {
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchParams.get("scroll") === "new-arrivals") {
      containerRef.current?.scrollIntoView({
        behavior: "smooth",
      });
    }
  }, [searchParams]);

  return (
    <Container className="mt-8 flex flex-col gap-y-8">
      <div id="new-arrivals" ref={containerRef} />
      <div className="space-y-4 text-center">
        <h2 className="font-serif text-4xl font-extrabold">
          Productos agregados recientemente
        </h2>
        <p className="text-base text-blue-yankees/70">
          ¡Descubre las últimas novedades en nuestra colección!{" "}
          {KAWAII_FACE_HAPPY}
        </p>
      </div>
      <Suspense fallback={<Loader />}>
        {newProducts.length === 0 ? (
          <NoResults message={`No hay productos nuevos ${KAWAII_FACE_SAD}`} />
        ) : (
          <div className="grid grid-cols-2 gap-1 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {newProducts.map((product) => (
              <ProductCard key={product.id} product={product} isNew />
            ))}
          </div>
        )}
      </Suspense>
    </Container>
  );
};

export default NewArrivals;
