"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { DELAY } from "@/constants";
import { cn } from "@/lib/utils";
import { Billboard } from "@/types";

interface HeroSliderProps {
  data: Billboard[];
}

export const HeroSlider: React.FC<HeroSliderProps> = ({ data }) => {
  const [index, setIndex] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  const resetTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  };

  useEffect(() => {
    resetTimeout();
    timeoutRef.current = setTimeout(
      () =>
        setIndex((prevIndex) =>
          prevIndex === data?.length - 1 ? 0 : prevIndex + 1,
        ),
      DELAY,
    );
    return () => {
      resetTimeout();
    };
  }, [data?.length, index]);

  const handleClick = (redirectUrl: string | null) => {
    if (redirectUrl) {
      router.push(redirectUrl);
    }
  };

  return (
    <div className="mx-auto my-0 overflow-hidden rounded-xl p-4 sm:p-6 lg:p-8">
      <div className="overflow-hidden">
        <div
          className="whitespace-nowrap"
          style={{
            transform: `translate3d(${-index * 100}%, 0, 0)`,
            transition: "ease 1000ms",
          }}
        >
          {data?.map(({ imageUrl, title, redirectUrl }, index) => (
            <div
              key={index}
              className={cn(
                "relative inline-block aspect-square w-full overflow-hidden rounded-xl md:aspect-[2.4/1]",
                {
                  "cursor-pointer": redirectUrl,
                },
              )}
              onClick={() => handleClick(redirectUrl)}
            >
              <Image
                src={imageUrl}
                alt="Hero Image"
                fill
                className="h-full w-full object-cover"
                quality={100}
                sizes="(max-width: 640px) 640px, 1280px"
              />
              {title && (
                <div className="flex h-full w-full flex-col items-center justify-center gap-y-8 text-center">
                  <div className="max-w-xs text-3xl font-bold sm:max-w-xl sm:text-5xl lg:text-6xl">
                    {title}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="text-center">
        {data?.map((_, idx) => (
          <div
            key={idx}
            className={cn(
              "mx-2 mb-0 mt-4 inline-block h-3 w-3 cursor-pointer rounded-full bg-pink-froly/30 xl:h-5 xl:w-5",
              {
                "bg-pink-froly": index === idx,
              },
            )}
            onClick={() => setIndex(idx)}
          ></div>
        ))}
      </div>
    </div>
  );
};
