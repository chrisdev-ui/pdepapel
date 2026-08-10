"use client";

import { Gallery } from "@/components/gallery";
import { ProductInfo } from "@/components/product-info";
import { Breadcrumb, BreadcrumbItem } from "@/components/ui/breadcrumb";
import { categoryPath } from "@/lib/routes";
import { Container } from "@/components/ui/container";
import { Separator } from "@/components/ui/separator";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { Product, ProductVariant } from "@/types";
import dynamic from "next/dynamic";
import { useCallback, useRef } from "react";
import { useInView } from "react-intersection-observer";

const Reviews = dynamic(
  () => import("@/components/reviews/reviews").then((module) => module.Reviews),
  { ssr: false },
);

interface SingleProductPageProps {
  product: Product;
  siblings?: ProductVariant[];
}

const ReviewsPlaceholder = () => (
  <div className="space-y-4" aria-hidden="true">
    <div className="h-9 w-48 animate-pulse rounded bg-muted" />
    <div className="h-24 animate-pulse rounded bg-muted" />
  </div>
);

export const SingleProductPage: React.FC<SingleProductPageProps> = ({
  product,
  siblings,
}) => {
  const reviewsRef = useRef<HTMLDivElement | null>(null);
  const { ref: reviewsViewportRef, inView: isReviewsInView } = useInView({
    rootMargin: "400px",
    triggerOnce: true,
  });
  const setReviewsRef = useCallback(
    (node: HTMLDivElement | null) => {
      reviewsRef.current = node;
      reviewsViewportRef(node);
    },
    [reviewsViewportRef],
  );

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Tienda", href: STOREFRONT_ROUTES.shop },
  ];

  if (product.category) {
    breadcrumbItems.push({
      label: product.category.name,
      href: categoryPath(product.category.slug || product.category.id),
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
        <div ref={setReviewsRef}>
          {isReviewsInView ? (
            <Reviews title="Comentarios" reviews={product.reviews} />
          ) : (
            <ReviewsPlaceholder />
          )}
        </div>
        <Separator className="my-10" />
      </Container>
    </>
  );
};
