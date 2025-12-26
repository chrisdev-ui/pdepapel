"use client";

import { Gallery } from "@/components/gallery";
import { ProductInfo } from "@/components/product-info";
import { Modal } from "@/components/ui/modal";
import { usePreviewModal } from "@/hooks/use-preview-modal";
import { useProductSiblings } from "@/hooks/use-product-siblings";
import { Product } from "@/types";
import { useEffect, useState } from "react";

export const PreviewModal: React.FC<{}> = () => {
  const previewModal = usePreviewModal();
  const product = usePreviewModal((state) => state.data);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Reset selected product when modal opens/closes or product changes
  useEffect(() => {
    if (product) {
      setSelectedProduct(product);
    }
  }, [product]);

  const currentProduct = selectedProduct || product;

  // Fetch siblings based on the ORIGINAL product's group ID (to keep the group context)
  // or based on currentProduct? Usually productGroupId is same for all.
  const { data: siblings = [], isLoading } = useProductSiblings(
    currentProduct?.productGroupId,
  );

  // Auto-select first sibling if current product lacks variant details (Group Parent case)
  useEffect(() => {
    if (
      siblings.length > 0 &&
      currentProduct &&
      !currentProduct.design &&
      !currentProduct.color &&
      !currentProduct.size
    ) {
      // Find the first variant that actually has a design/color defined
      const defaultVariant = siblings.find(
        (variant) => variant.design || variant.color,
      );
      if (defaultVariant) {
        setSelectedProduct(defaultVariant);
      }
    }
  }, [siblings, currentProduct]);

  if (!currentProduct) {
    return null;
  }

  return (
    <Modal open={previewModal.isOpen} onClose={previewModal.onClose}>
      <div className="grid w-full grid-cols-1 items-start gap-x-6 gap-y-8 sm:grid-cols-12 lg:gap-x-8">
        <div className="sm:col-span-4 lg:col-span-5">
          <Gallery images={currentProduct.images} />
        </div>
        <div className="sm:col-span-8 lg:col-span-7">
          <ProductInfo
            data={currentProduct}
            siblings={siblings as Product[]}
            showDescription={false}
            showReviews={false}
            onAddedToCart={previewModal.onClose}
            onVariantChange={(variant) =>
              setSelectedProduct(variant as Product)
            }
            isLoading={isLoading}
          />
        </div>
      </div>
    </Modal>
  );
};
