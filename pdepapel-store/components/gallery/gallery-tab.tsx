"use client";

import { TabsTrigger } from "@/components/ui/tabs";
import { Image as ImageType } from "@/types";
import Image from "next/image";

interface GalleryTabProps {
  image: ImageType;
}

export const GalleryTab: React.FC<GalleryTabProps> = ({ image }) => {
  return (
    <TabsTrigger
      value={image.id}
      className="group relative flex aspect-square cursor-pointer items-center justify-center rounded-md bg-white"
    >
      <div>
        <span className="absolute inset-0 aspect-square h-full w-full overflow-hidden rounded-md">
          <Image
            src={image.url}
            alt="Imagen del producto"
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            priority
            className="object-cover object-center"
          />
        </span>
        <span className="absolute inset-0 rounded-md ring-2 ring-offset-2 group-data-[state=active]:ring-blue-yankees group-data-[state=inactive]:ring-transparent" />
      </div>
    </TabsTrigger>
  );
};
