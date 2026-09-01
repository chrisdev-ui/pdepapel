"use client";

import { cloudinaryImageLoader } from "@/lib/cloudinary-image-loader";
import { cn } from "@/lib/utils";
import { Image as ImageType } from "@/types";
import Image from "next/image";
import { useState } from "react";

interface GalleryProps {
  images: ImageType[];
  productName: string;
}

const PRODUCT_IMAGE_SIZES =
  "(max-width: 639px) calc(100vw - 2rem), (max-width: 1023px) calc(100vw - 3rem), (max-width: 1279px) calc(50vw - 3rem), 608px";

export const Gallery: React.FC<GalleryProps> = ({
  images = [],
  productName,
}) => {
  const mainImageIndex = images.findIndex((image) => image.isMain);
  const [selectedIndex, setSelectedIndex] = useState(
    mainImageIndex >= 0 ? mainImageIndex : 0,
  );

  if (!images || images.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-muted">
        <span className="text-muted-foreground">No image</span>
      </div>
    );
  }

  const selectedImage = images[selectedIndex] ?? images[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted sm:rounded-lg">
        <Image
          fill
          loader={cloudinaryImageLoader}
          src={selectedImage.url}
          alt={productName}
          sizes={PRODUCT_IMAGE_SIZES}
          priority
          className="object-cover object-center"
        />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((image, index) => (
            <button
              key={image.id}
              onClick={() => setSelectedIndex(index)}
              className={cn(
                "relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md border-2 transition-colors",
                selectedIndex === index
                  ? "border-blue-yankees"
                  : "border-transparent hover:border-gray-300",
              )}
            >
              <Image
                src={image.url}
                alt={`Vista ${index + 1} de ${productName}`}
                fill
                loader={cloudinaryImageLoader}
                sizes="64px"
                className="object-cover object-center"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
