"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getProduct } from "@/actions/get-product";
import { Gallery } from "@/components/gallery";
import { KitContents } from "@/components/kit-contents";
import { ProductInfo } from "@/components/product-info";
import { ProductStickyBar } from "@/components/product-sticky-bar";
import { Reviews } from "@/components/reviews/reviews";
import { Breadcrumb, BreadcrumbItem } from "@/components/ui/breadcrumb";
import { Container } from "@/components/ui/container";
import { ProductBadge } from "@/components/ui/product-badge";
import { toast } from "@/hooks/use-toast";
import { getProductAvailability } from "@/lib/product-availability";
import { getProductCardBadges, isRecentlyCreated } from "@/lib/product-card";
import { getStableProductVariants } from "@/lib/product-variants";
import { categoryPath, productPath, STOREFRONT_ROUTES } from "@/lib/routes";
import { Product, ProductVariant } from "@/types";

interface SingleProductPageProps {
  product: Product;
  siblings?: ProductVariant[];
  earlyAccess?: boolean;
}

export const SingleProductPage: React.FC<SingleProductPageProps> = ({ product, siblings, earlyAccess = false }) => {
  const [selectedProduct, setSelectedProduct] = useState(product);
  const [isVariantLoading, setIsVariantLoading] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const selectedProductRef = useRef(product);
  const variantRequestRef = useRef(0);
  const ctaRef = useRef<HTMLDivElement>(null);

  const variants = useMemo(() => getStableProductVariants(product, siblings), [product, siblings]);

  useEffect(() => {
    variantRequestRef.current += 1;
    selectedProductRef.current = product;
    setSelectedProduct(product);
    setIsVariantLoading(false);
    setQuantity(1);
  }, [product]);

  const selectVariant = useCallback(async (variant: Product | ProductVariant, updateHistory = true) => {
    if (variant.id === selectedProductRef.current.id) return;
    const requestId = ++variantRequestRef.current;
    setIsVariantLoading(true);
    try {
      const nextProduct = await getProduct(variant.slug || variant.id);
      if (requestId !== variantRequestRef.current) return;
      if (!nextProduct) {
        toast({ description: "No pudimos cargar esta opción. Inténtalo de nuevo.", variant: "destructive" });
        return;
      }
      selectedProductRef.current = nextProduct;
      setSelectedProduct(nextProduct);
      setQuantity(1);
      if (updateHistory) window.history.pushState(null, "", productPath(nextProduct.slug || nextProduct.id));
    } catch {
      if (requestId === variantRequestRef.current) toast({ description: "No pudimos cargar esta opción. Inténtalo de nuevo.", variant: "destructive" });
    } finally {
      if (requestId === variantRequestRef.current) setIsVariantLoading(false);
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const variant = variants.find((item) => productPath(item.slug || item.id) === window.location.pathname);
      if (variant) void selectVariant(variant, false);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [selectVariant, variants]);

  const breadcrumbItems: BreadcrumbItem[] = [{ label: "Tienda", href: STOREFRONT_ROUTES.shop }];
  if (selectedProduct.category) {
    breadcrumbItems.push({ label: selectedProduct.category.name, href: categoryPath(selectedProduct.category.slug || selectedProduct.category.id) });
  }
  breadcrumbItems.push({ label: selectedProduct.name, isCurrent: true });

  const availability = getProductAvailability(selectedProduct, { earlyAccess });
  const badges = getProductCardBadges(selectedProduct, { isNew: isRecentlyCreated(selectedProduct) });
  const focusNotifyForm = () => {
    const input = document.querySelector<HTMLInputElement>(`[data-product-signals="${selectedProduct.id}"] input[type="email"]`);
    input?.scrollIntoView({ block: "center", behavior: "smooth" });
    input?.focus({ preventScroll: true });
  };

  return (
    <Container className="flex max-w-7xl flex-col gap-10 px-4 py-6 sm:px-6 lg:gap-14 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-5">
        <Breadcrumb items={breadcrumbItems} />
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-12">
          <Gallery
            key={selectedProduct.id}
            images={selectedProduct.images}
            productName={selectedProduct.name}
            badge={
              badges.commercial || badges.catalog ? (
                <span className="flex flex-col items-start gap-1.5">
                  {badges.commercial && <ProductBadge badge={badges.commercial} />}
                  {badges.catalog && <ProductBadge badge={badges.catalog} />}
                </span>
              ) : null
            }
          />
          <div className="mt-8 lg:mt-0">
            <ProductInfo
              data={selectedProduct}
              siblings={variants as ProductVariant[]}
              onVariantChange={selectVariant}
              isLoading={isVariantLoading}
              earlyAccess={earlyAccess}
              quantity={quantity}
              onQuantityChange={setQuantity}
              ctaRef={ctaRef}
            />
          </div>
        </div>
      </div>
      {selectedProduct.isKit && selectedProduct.kitComponents && <KitContents components={selectedProduct.kitComponents} />}
      <Reviews productId={selectedProduct.id} reviews={selectedProduct.reviews ?? []} />
      <ProductStickyBar product={selectedProduct} availability={availability} quantity={quantity} targetRef={ctaRef} onNotify={focusNotifyForm} />
    </Container>
  );
};
