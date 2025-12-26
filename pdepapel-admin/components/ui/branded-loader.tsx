"use client";

import Image from "next/image";

export const BrandedLoader = () => {
  return (
    <div className="flex h-full w-full items-center justify-center bg-background/50 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-6">
        <div className="relative h-24 w-24">
          <Image
            src="/images/text-below-transparent-bg.webp"
            alt="Logo"
            fill
            className="object-contain"
            priority
          />
        </div>
        {/* Infinite Progressive Bar */}
        <div className="flex h-6 items-center gap-1.5">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="h-full w-1.5 animate-pulse rounded-full bg-primary"
              style={{
                animationDuration: "1s",
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
