"use client";

import { CldImage } from "@/components/ui/CldImage";
import { cn } from "@/lib/utils";
import { Image as ImageType } from "@/types";
import { useState } from "react";

interface GalleryProps {
  images: ImageType[];
}

export const Gallery: React.FC<GalleryProps> = ({ images = [] }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (!images || images.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-muted">
        <span className="text-muted-foreground">No image</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted sm:rounded-lg">
        <CldImage
          fill
          src={images[selectedIndex]?.url}
          alt="Imagen principal del producto"
          sizes="(max-width: 1024px) 100vw, 50vw"
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
              <CldImage
                src={image.url}
                alt={`Thumbnail ${index + 1}`}
                fill
                className="object-cover object-center"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
