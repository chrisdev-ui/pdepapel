"use client";

import dynamic from "next/dynamic";
import { useRef } from "react";

import { Gallery } from "@/components/gallery";
import { ProductInfo } from "@/components/product-info";
import { ProductList } from "@/components/product-list";
import { Reviews } from "@/components/reviews/reviews";
import { Container } from "@/components/ui/container";
import { Separator } from "@/components/ui/separator";
import { Product } from "@/types";

const Newsletter = dynamic(() => import("@/components/newsletter"), {
  ssr: false,
});

interface SingleProductPageProps {
  product: Product;
  suggestedProducts: Product[];
}

export const SingleProductPage: React.FC<SingleProductPageProps> = ({
  product,
  suggestedProducts,
}) => {
  const reviewsRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <Container className="max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8">
          <Gallery images={product.images} />
          <div className="mt-10 px-4 sm:mt-6 sm:px-0 lg:mt-0">
            <ProductInfo data={product} reviewsRef={reviewsRef} />
          </div>
        </div>
        <Separator className="my-10" />
        <Reviews
          reviewsRef={reviewsRef}
          title="Comentarios"
          reviews={product.reviews}
        />
        <Separator className="my-10" />
        <ProductList
          title="Productos relacionados"
          products={suggestedProducts}
        />
      </Container>
      <Newsletter />
    </>
  );
};
