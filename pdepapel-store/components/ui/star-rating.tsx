"use client";

import { cn } from "@/lib/utils";
import { Star } from "lucide-react";
import { useEffect, useState } from "react";

interface StarRatingProps {
  className?: string;
  isDisabled?: boolean;
  currentRating?: number;
  onRatingChange?: (rating: number) => void;
}

export const StarRating: React.FC<StarRatingProps> = ({
  className,
  isDisabled = false,
  currentRating = 0,
  onRatingChange,
}) => {
  const [rating, setRating] = useState<number>(currentRating);
  const [hover, setHover] = useState<number>(currentRating);

  useEffect(() => {
    setRating(currentRating);
    setHover(currentRating);
  }, [currentRating]);

  return (
    <div>
      {[...Array(5)].map((_, index) => {
        index += 1;
        return (
          <button
            key={index}
            type="button"
            className={cn(
              "h-5 w-5 cursor-pointer",
              {
                "cursor-default": isDisabled,
              },
              className,
            )}
            onClick={() => {
              setRating(index);
              onRatingChange?.(index);
            }}
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(rating)}
            onDoubleClick={() => {
              setRating(0);
              onRatingChange?.(0);
              setHover(0);
            }}
            disabled={isDisabled}
          >
            <Star
              fill={
                index <= ((rating && hover) || hover)
                  ? "hsl(var(--yellow-star))"
                  : "none"
              }
              className="h-full w-full text-yellow-star"
            />
          </button>
        );
      })}
    </div>
  );
};
