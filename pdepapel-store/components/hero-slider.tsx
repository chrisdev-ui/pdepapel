"use client";

import { DELAY } from "@/constants";
import { cn } from "@/lib/utils";
import { Billboard } from "@/types";
import { useEffect, useRef, useState } from "react";

interface HeroSliderProps {
  data: Billboard[];
}

export const HeroSlider: React.FC<HeroSliderProps> = ({ data }) => {
  const [index, setIndex] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

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
          {data?.map(({ label, imageUrl }, index) => (
            <div
              key={index}
              className="relative inline-block aspect-square w-full overflow-hidden rounded-xl bg-cover md:aspect-[2.4/1]"
              style={{ backgroundImage: `url(${imageUrl})` }}
            >
              <div className="flex h-full w-full flex-col items-center justify-center gap-y-8 text-center">
                <div className="max-w-xs text-3xl font-bold sm:max-w-xl sm:text-5xl lg:text-6xl">
                  {label}
                </div>
              </div>
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
