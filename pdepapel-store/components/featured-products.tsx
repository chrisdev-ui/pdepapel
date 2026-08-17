"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { Container } from "@/components/ui/container";
import { NoResults } from "@/components/ui/no-results";
import ProductCard from "@/components/ui/product-card";
import { KAWAII_FACE_EXCITED, KAWAII_FACE_SAD } from "@/constants";
import { cn } from "@/lib/utils";
import { Product, Season } from "@/types";
import { Gift, Ghost, Snowflake, Sparkles } from "lucide-react";

interface FeaturedProductsProps {
  featureProducts: Product[];
  season?: Season;
}

const FeaturedProducts: React.FC<FeaturedProductsProps> = ({
  featureProducts,
  season = Season.Default,
}) => {
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);
  const isSpooky = season === Season.Spooky;
  const isChristmas = season === Season.Christmas;

  useEffect(() => {
    if (searchParams.get("scroll") === "featured-products") {
      containerRef.current?.scrollIntoView({
        behavior: "smooth",
      });
    }
  }, [searchParams]);

  return (
    <Container component="section" className="mt-8 flex flex-col gap-y-8">
      <div id="featured-products" ref={containerRef} />
      <section
        className={cn(
          "space-y-4 text-center",
          isSpooky &&
            "rounded-3xl border border-orange-200/80 bg-gradient-to-r from-orange-50 via-kawaii-pink-light/25 to-kawaii-lavender/20 px-4 py-6 shadow-sm sm:px-8 sm:py-8",
          isChristmas &&
            "rounded-3xl border border-red-200/80 bg-gradient-to-r from-red-50 via-kawaii-pink-light/25 to-blue-50 px-4 py-6 shadow-sm sm:px-8 sm:py-8",
        )}
      >
        {isSpooky && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200/80 bg-background/75 px-3 py-1 text-xs font-bold text-blue-yankees">
            <Ghost className="h-3.5 w-3.5 fill-kawaii-lavender/30 text-kawaii-lavender" />
            Selección de temporada
            <Sparkles className="h-3.5 w-3.5 text-orange-400" />
          </span>
        )}
        {isChristmas && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200/80 bg-background/75 px-3 py-1 text-xs font-bold text-blue-yankees">
            <Snowflake className="h-3.5 w-3.5 text-blue-400" />
            Selección de Navidad
            <Gift className="h-3.5 w-3.5 fill-red-100 text-red-400" />
          </span>
        )}
        <h2 className="font-serif text-4xl font-extrabold">
          {isSpooky
            ? "Favoritos de octubre"
            : isChristmas
              ? "Favoritos de Navidad"
              : "Productos destacados"}
        </h2>
        <p className="text-base text-blue-yankees/70">
          {isSpooky
            ? "Una selección especial para una temporada mágica."
            : isChristmas
              ? "Ideas bonitas para regalar, crear y celebrar."
              : `Los favoritos de nuestra colección, ¡no puedes perdértelos! ${KAWAII_FACE_EXCITED}`}
        </p>
      </section>
      {featureProducts.length === 0 ? (
        <NoResults
          message={
            isSpooky
              ? `Pronto habrá favoritos de octubre ${KAWAII_FACE_SAD}`
              : isChristmas
                ? `Pronto habrá favoritos de Navidad ${KAWAII_FACE_SAD}`
              : `No hay productos destacados ${KAWAII_FACE_SAD}`
          }
        />
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
