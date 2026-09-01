"use client";

import { Gallery } from "@/components/gallery";
import { ProductInfo } from "@/components/product-info";
import { Breadcrumb, BreadcrumbItem } from "@/components/ui/breadcrumb";
import { getProduct } from "@/actions/get-product";
import { categoryPath } from "@/lib/routes";
import { Container } from "@/components/ui/container";
import { Separator } from "@/components/ui/separator";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { toast } from "@/hooks/use-toast";
import { getStableProductVariants } from "@/lib/product-variants";
import { productPath } from "@/lib/routes";
import { Product, ProductVariant } from "@/types";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [selectedProduct, setSelectedProduct] = useState(product);
  const [isVariantLoading, setIsVariantLoading] = useState(false);
  const reviewsRef = useRef<HTMLDivElement | null>(null);
  const selectedProductRef = useRef(product);
  const variantRequestRef = useRef(0);
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

  const variants = useMemo(
    () => getStableProductVariants(product, siblings),
    [product, siblings],
  );

  useEffect(() => {
    variantRequestRef.current += 1;
    selectedProductRef.current = product;
    setSelectedProduct(product);
    setIsVariantLoading(false);
  }, [product]);

  const selectVariant = useCallback(
    async (
      variant: Product | ProductVariant,
      updateHistory = true,
    ) => {
      if (variant.id === selectedProductRef.current.id) return;

      const requestId = ++variantRequestRef.current;
      setIsVariantLoading(true);

      try {
        const nextProduct = await getProduct(variant.slug || variant.id);

        if (requestId !== variantRequestRef.current) return;

        if (!nextProduct) {
          toast({
            description: "No pudimos cargar esta opción. Inténtalo de nuevo.",
            variant: "destructive",
          });
          return;
        }

        selectedProductRef.current = nextProduct;
        setSelectedProduct(nextProduct);

        if (updateHistory) {
          window.history.pushState(
            null,
            "",
            productPath(nextProduct.slug || nextProduct.id),
          );
        }
      } catch {
        if (requestId === variantRequestRef.current) {
          toast({
            description: "No pudimos cargar esta opción. Inténtalo de nuevo.",
            variant: "destructive",
          });
        }
      } finally {
        if (requestId === variantRequestRef.current) {
          setIsVariantLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    const handlePopState = () => {
      const variant = variants.find(
        (item) =>
          productPath(item.slug || item.id) === window.location.pathname,
      );

      if (variant) {
        void selectVariant(variant, false);
      }
    };

    window.addEventListener("popstate", handlePopState);

    return () => window.removeEventListener("popstate", handlePopState);
  }, [selectVariant, variants]);

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Tienda", href: STOREFRONT_ROUTES.shop },
  ];

  if (selectedProduct.category) {
    breadcrumbItems.push({
      label: selectedProduct.category.name,
      href: categoryPath(
        selectedProduct.category.slug || selectedProduct.category.id,
      ),
    });
  }

  breadcrumbItems.push({
    label: selectedProduct.name,
    isCurrent: true,
  });

  return (
    <>
      <Container className="max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Breadcrumb items={breadcrumbItems} />
        </div>
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8">
          <Gallery
            key={selectedProduct.id}
            images={selectedProduct.images}
            productName={selectedProduct.name}
          />
          <div className="mt-10 px-4 sm:mt-6 sm:px-0 lg:mt-0">
            <ProductInfo
              data={selectedProduct}
              reviewsRef={reviewsRef}
              siblings={variants as ProductVariant[]}
              onVariantChange={selectVariant}
              isLoading={isVariantLoading}
            />
          </div>
        </div>
        <Separator className="my-10" />
        <div ref={setReviewsRef}>
          {isReviewsInView ? (
            <Reviews
              title="Comentarios"
              reviews={selectedProduct.reviews}
            />
          ) : (
            <ReviewsPlaceholder />
          )}
        </div>
        <Separator className="my-10" />
      </Container>
    </>
  );
};
