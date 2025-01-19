import { AspectRatio } from "@/components/ui/aspect-ratio";
import { cn } from "@/lib/utils";
import { AspectRatioProps } from "@radix-ui/react-aspect-ratio";
import Image from "next/image";
import React from "react";

interface DataTableCellImageProps extends React.HTMLAttributes<HTMLDivElement> {
  ratio: AspectRatioProps["ratio"];
  src: React.ComponentProps<typeof Image>["src"];
  alt: React.ComponentProps<typeof Image>["alt"];
}

export function DataTableCellImage({
  className,
  ratio,
  src,
  alt,
  ...props
}: DataTableCellImageProps) {
  return (
    <div className={cn("w-16", className)} {...props}>
      <AspectRatio ratio={ratio} className="bg-muted">
        <Image
          src={src}
          fill
          alt={alt}
          className="h-full w-full rounded-md object-cover"
          unoptimized
        />
      </AspectRatio>
    </div>
  );
}
