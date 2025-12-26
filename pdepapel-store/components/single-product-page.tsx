"use client";

import { Gallery } from "@/components/gallery";
import Newsletter from "@/components/newsletter";
import { ProductInfo } from "@/components/product-info";
import { ProductList } from "@/components/product-list";
import { Reviews } from "@/components/reviews/reviews";
import { Breadcrumb, BreadcrumbItem } from "@/components/ui/breadcrumb";
import { Container } from "@/components/ui/container";
import { Separator } from "@/components/ui/separator";
import { Product, ProductVariant } from "@/types";
import { useRef } from "react";

interface SingleProductPageProps {
  product: Product;
  suggestedProducts: Product[];
  siblings?: ProductVariant[];
}

export const SingleProductPage: React.FC<SingleProductPageProps> = ({
  product,
  suggestedProducts,
  siblings,
}) => {
  const reviewsRef = useRef<HTMLDivElement>(null);

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Tienda", href: "/shop" },
  ];

  if (product.category) {
    breadcrumbItems.push({
      label: product.category.name,
      href: `/shop?categoryId=${product.category.id}`,
    });
  }

  breadcrumbItems.push({
    label: product.name,
    isCurrent: true,
  });

  return (
    <>
      <Container className="max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Breadcrumb items={breadcrumbItems} />
        </div>
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8">
          <Gallery images={product.images} />
          <div className="mt-10 px-4 sm:mt-6 sm:px-0 lg:mt-0">
            <ProductInfo
              data={product}
              reviewsRef={reviewsRef}
              siblings={siblings}
            />
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
