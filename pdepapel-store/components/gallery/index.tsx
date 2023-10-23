"use client";

import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { Image as ImageType } from "@/types";
import Image from "next/image";
import { GalleryTab } from "./gallery-tab";

interface GalleryProps {
  images: ImageType[];
}

export const Gallery: React.FC<GalleryProps> = ({ images = [] }) => {
  return (
    <Tabs defaultValue={images[0].id}>
      <div className="flex flex-col-reverse">
        <div className="mx-auto mt-6 hidden w-full max-w-2xl sm:block lg:max-w-none">
          <TabsList className="grid grid-cols-4 gap-6">
            {images.map((image) => (
              <GalleryTab key={image.id} image={image} />
            ))}
          </TabsList>
        </div>
        <div className="aspect-square w-full">
          {images.map((image) => (
            <TabsContent key={image.id} value={image.id}>
              <div className="relative aspect-square h-full w-full overflow-hidden sm:rounded-lg">
                <Image
                  fill
                  src={image.url}
                  alt="Image"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  quality={100}
                  className="object-cover object-center"
                />
              </div>
            </TabsContent>
          ))}
        </div>
      </div>
    </Tabs>
  );
};
