"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { Container } from "@/components/ui/container";
import { NoResults } from "@/components/ui/no-results";
import ProductCard from "@/components/ui/product-card";
import { KAWAII_FACE_EXCITED, KAWAII_FACE_SAD } from "@/constants";
import { Product } from "@/types";

interface FeaturedProductsProps {
  featureProducts: Product[];
}

const FeaturedProducts: React.FC<FeaturedProductsProps> = ({
  featureProducts,
}) => {
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchParams.get("scroll") === "featured-products") {
      containerRef.current?.scrollIntoView({
        behavior: "smooth",
      });
    }
  }, [searchParams]);

  return (
    <Container className="mt-8 flex flex-col gap-y-8">
      <div id="featured-products" ref={containerRef} />
      <div className="space-y-4 text-center">
        <h2 className="font-serif text-4xl font-extrabold">
          Productos destacados
        </h2>
        <p className="text-base text-blue-yankees/70">
          Los favoritos de nuestra colección, ¡no puedes perdértelos!{" "}
          {KAWAII_FACE_EXCITED}
        </p>
      </div>
      {featureProducts.length === 0 ? (
        <NoResults message={`No hay productos destacados ${KAWAII_FACE_SAD}`} />
      ) : (
        <div className="grid grid-cols-2 gap-1 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {featureProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </Container>
  );
};

export default FeaturedProducts;
