"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ProductFilters, useProductFilters } from "@/hooks/use-product-filters";

import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

interface PriceFilterProps {
  min?: number;
  max?: number;
  step?: number;
}

const PriceFilter: React.FC<PriceFilterProps> = ({
  min = 0,
  max = 1000000,
  step = 10000,
}) => {
  const { filters, setFilters } = useProductFilters();

  const [minValue, setMinValue] = useState(filters.minPrice ?? min);
  const [maxValue, setMaxValue] = useState(filters.maxPrice ?? max);
  const [isDragging, setIsDragging] = useState<"min" | "max" | null>(null);
  const sliderRef = useRef<HTMLDivElement>(null);

  const debouncedMin = useDebounce(minValue, 300);
  const debouncedMax = useDebounce(maxValue, 300);

  // Sync state when URL changes externally
  useEffect(() => {
    setMinValue(filters.minPrice ?? min);
    setMaxValue(filters.maxPrice ?? max);
  }, [filters.minPrice, filters.maxPrice, min, max]);

  // Sync URL when debounced values change
  useEffect(() => {
    const currentMin = filters.minPrice ?? min;
    const currentMax = filters.maxPrice ?? max;

    if (debouncedMin !== currentMin || debouncedMax !== currentMax) {
      setFilters((prev: ProductFilters) => ({
        ...prev,
        minPrice: debouncedMin === min ? null : debouncedMin,
        maxPrice: debouncedMax === max ? null : debouncedMax,
        page: 1, // Reset page when price changes
      }));
    }
  }, [
    debouncedMin,
    debouncedMax,
    filters.minPrice,
    filters.maxPrice,
    setFilters,
    min,
    max,
  ]);

  const minPercent = ((minValue - min) / (max - min)) * 100;
  const maxPercent = ((maxValue - min) / (max - min)) * 100;

  const formatPrice = (value: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const handleMouseDown = (type: "min" | "max") => {
    setIsDragging(type);
  };

  const handleMove = useCallback(
    (clientX: number) => {
      if (!isDragging || !sliderRef.current) return;

      const rect = sliderRef.current.getBoundingClientRect();
      const percent = Math.max(
        0,
        Math.min(100, ((clientX - rect.left) / rect.width) * 100),
      );
      const value =
        Math.round(((percent / 100) * (max - min) + min) / step) * step;

      if (isDragging === "min") {
        setMinValue(Math.min(value, maxValue - step));
      } else {
        setMaxValue(Math.max(value, minValue + step));
      }
    },
    [isDragging, minValue, maxValue, max, min, step],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      handleMove(e.clientX);
    },
    [handleMove],
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      handleMove(e.touches[0].clientX);
    },
    [handleMove],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(null);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.addEventListener("touchmove", handleTouchMove);
      document.addEventListener("touchend", handleMouseUp);

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.removeEventListener("touchmove", handleTouchMove);
        document.removeEventListener("touchend", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove]);

  return (
    <div className="w-full pb-8 pt-6">
      <div className="mb-8">
        <h3 className="mb-2 font-serif text-base font-semibold text-gray-900">
          Precio
        </h3>
      </div>

      {/* Price Display */}
      <div className="mb-4 flex items-center justify-between px-2">
        <div className="flex flex-col">
          <span className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
            Mínimo
          </span>
          <div className="relative">
            <span className="text-lg font-bold tabular-nums text-gray-900">
              {formatPrice(minValue)}
            </span>
            <div
              className={cn(
                "absolute -inset-2 -z-10 rounded-lg bg-primary/10 transition-opacity duration-200",
                isDragging === "min" ? "opacity-100" : "opacity-0",
              )}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 text-gray-400">
          <div className="h-px w-4 bg-gray-200" />
        </div>

        <div className="flex flex-col items-end">
          <span className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
            Máximo
          </span>
          <div className="relative">
            <span className="text-lg font-bold tabular-nums text-gray-900">
              {formatPrice(maxValue)}
            </span>
            <div
              className={cn(
                "absolute -inset-2 -z-10 rounded-lg bg-primary/10 transition-opacity duration-200",
                isDragging === "max" ? "opacity-100" : "opacity-0",
              )}
            />
          </div>
        </div>
      </div>

      {/* Slider */}
      <div className="relative px-2" ref={sliderRef}>
        {/* Background Track */}
        <div className="relative h-2 rounded-full bg-gray-100">
          {/* Active Range */}
          <div
            className="absolute h-full rounded-full bg-black transition-all duration-75"
            style={{
              left: `${minPercent}%`,
              right: `${100 - maxPercent}%`,
            }}
          />
        </div>

        {/* Min Thumb */}
        <div
          className={cn(
            "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-grab hover:scale-110 focus:outline-none active:cursor-grabbing",
            isDragging === "min" && "z-20 scale-110",
          )}
          style={{ left: `${minPercent}%` }}
          onMouseDown={() => handleMouseDown("min")}
          onTouchStart={() => handleMouseDown("min")}
        >
          <div
            className={cn(
              "h-5 w-5 rounded-full border-2 border-white bg-black shadow-lg transition-all duration-200",
              isDragging === "min" && "ring-4 ring-black/10",
            )}
          />
        </div>

        {/* Max Thumb */}
        <div
          className={cn(
            "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-grab hover:scale-110 focus:outline-none active:cursor-grabbing",
            isDragging === "max" && "z-20 scale-110",
          )}
          style={{ left: `${maxPercent}%` }}
          onMouseDown={() => handleMouseDown("max")}
          onTouchStart={() => handleMouseDown("max")}
        >
          <div
            className={cn(
              "h-5 w-5 rounded-full border-2 border-white bg-black shadow-lg transition-all duration-200",
              isDragging === "max" && "ring-4 ring-black/10",
            )}
          />
        </div>
      </div>

      {/* Quick Select Buttons */}
      <div className="mt-6 flex flex-wrap gap-2">
        {[
          { label: "Menos de $5.000", min: 0, max: 5000 },
          { label: "$5.000 - $10.000", min: 5000, max: 10000 },
          { label: "$10.000 - $20.000", min: 10000, max: 20000 },
          { label: "$20.000 - $50.000", min: 20000, max: 50000 },
          { label: "Más de $50.000", min: 50000, max: 1000000 },
        ].map((preset) => (
          <button
            key={preset.label}
            onClick={() => {
              setMinValue(preset.min);
              setMaxValue(preset.max);
            }}
            className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors duration-200 hover:bg-black hover:text-white"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default PriceFilter;
