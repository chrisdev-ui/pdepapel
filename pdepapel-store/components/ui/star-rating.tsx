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

const RATING_STEPS = [1, 2, 3, 4, 5];

interface ReadOnlyStarRatingProps {
  className?: string;
  currentRating: number;
}

const ReadOnlyStarRating: React.FC<ReadOnlyStarRatingProps> = ({
  className,
  currentRating,
}) => {
  const rating = Math.min(5, Math.max(0, Math.round(currentRating)));

  return (
    <div
      role="img"
      aria-label={`Calificación: ${rating} de 5 estrellas`}
      className="inline-flex items-center gap-0.5"
    >
      {RATING_STEPS.map((step) => (
        <Star
          key={step}
          aria-hidden="true"
          fill={step <= rating ? "hsl(var(--yellow-star))" : "none"}
          className={cn("h-5 w-5 text-yellow-star", className)}
        />
      ))}
    </div>
  );
};

interface InteractiveStarRatingProps {
  className?: string;
  currentRating: number;
  onRatingChange?: (rating: number) => void;
}

const InteractiveStarRating: React.FC<InteractiveStarRatingProps> = ({
  className,
  currentRating,
  onRatingChange,
}) => {
  const [rating, setRating] = useState<number>(currentRating);
  const [hover, setHover] = useState<number>(currentRating);

  useEffect(() => {
    setRating(currentRating);
    setHover(currentRating);
  }, [currentRating]);

  return (
    <div
      role="group"
      aria-label="Selecciona una calificación de 1 a 5 estrellas"
      className="inline-flex items-center gap-0.5"
    >
      {RATING_STEPS.map((index) => {
        return (
          <button
            key={index}
            type="button"
            className={cn(
              "h-5 w-5 cursor-pointer",
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
            aria-label={`${index} estrella${index > 1 ? "s" : ""}`}
          >
            <Star
              aria-hidden="true"
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

export const StarRating: React.FC<StarRatingProps> = ({
  className,
  isDisabled = false,
  currentRating = 0,
  onRatingChange,
}) => {
  if (isDisabled) {
    return (
      <ReadOnlyStarRating
        className={className}
        currentRating={currentRating}
      />
    );
  }

  return (
    <InteractiveStarRating
      className={className}
      currentRating={currentRating}
      onRatingChange={onRatingChange}
    />
  );
};
