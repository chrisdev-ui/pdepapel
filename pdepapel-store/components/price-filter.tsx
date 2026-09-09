"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { FilterSection } from "@/components/filter";
import { useDebounce } from "@/hooks/use-debounce";
import { ProductFilters } from "@/hooks/use-product-filters";
import { PRICE_MAX, PRICE_MIN, PRICE_PRESETS, PRICE_STEP } from "@/lib/shop-filters";
import { cn, currencyFormatter } from "@/lib/utils";
import { useFilterState } from "@/providers/filter-state-provider";

interface PriceFilterProps {
  min?: number;
  max?: number;
  step?: number;
  defaultOpen?: boolean;
}

const thumbClass =
  "absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 border-blue-yankees bg-white shadow-[0_2px_6px_rgba(34,27,65,0.2)] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2 active:cursor-grabbing";

/** Rango de precio: campos mínimo y máximo, deslizador de dos pulgares y presets. */
const PriceFilter: React.FC<PriceFilterProps> = ({ min = PRICE_MIN, max = PRICE_MAX, step = PRICE_STEP, defaultOpen = true }) => {
  const { filters, setFilters } = useFilterState();
  const [minValue, setMinValue] = useState(filters.minPrice ?? min);
  const [maxValue, setMaxValue] = useState(filters.maxPrice ?? max);
  const [dragging, setDragging] = useState<"min" | "max" | null>(null);
  const sliderRef = useRef<HTMLDivElement>(null);

  const debouncedMin = useDebounce(minValue, 300);
  const debouncedMax = useDebounce(maxValue, 300);

  useEffect(() => {
    setMinValue(filters.minPrice ?? min);
    setMaxValue(filters.maxPrice ?? max);
  }, [filters.minPrice, filters.maxPrice, min, max]);

  useEffect(() => {
    const currentMin = filters.minPrice ?? min;
    const currentMax = filters.maxPrice ?? max;
    if (debouncedMin !== currentMin || debouncedMax !== currentMax) {
      setFilters((previous: ProductFilters) => ({
        ...previous,
        minPrice: debouncedMin === min ? null : debouncedMin,
        maxPrice: debouncedMax === max ? null : debouncedMax,
        page: 1,
      }));
    }
  }, [debouncedMin, debouncedMax, filters.minPrice, filters.maxPrice, setFilters, min, max]);

  const minPercent = ((minValue - min) / (max - min)) * 100;
  const maxPercent = ((maxValue - min) / (max - min)) * 100;
  const isActive = filters.minPrice !== null || filters.maxPrice !== null;

  const update = (type: "min" | "max", value: number) => {
    if (type === "min") setMinValue(Math.max(min, Math.min(value, maxValue - step)));
    else setMaxValue(Math.min(max, Math.max(value, minValue + step)));
  };

  const onKeyDown = (type: "min" | "max", event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = type === "min" ? minValue : maxValue;
    const pageStep = step * 10;
    const next: Record<string, number | undefined> = {
      ArrowLeft: current - step,
      ArrowDown: current - step,
      ArrowRight: current + step,
      ArrowUp: current + step,
      PageDown: current - pageStep,
      PageUp: current + pageStep,
      Home: type === "min" ? min : min + step,
      End: type === "max" ? max : max - step,
    };
    const value = next[event.key];
    if (value === undefined) return;
    event.preventDefault();
    update(type, value);
  };

  const moveTo = useCallback(
    (clientX: number) => {
      if (!dragging || !sliderRef.current) return;
      const rect = sliderRef.current.getBoundingClientRect();
      const percent = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
      const value = Math.round(((percent / 100) * (max - min) + min) / step) * step;
      if (dragging === "min") setMinValue(Math.min(value, maxValue - step));
      else setMaxValue(Math.max(value, minValue + step));
    },
    [dragging, minValue, maxValue, max, min, step],
  );

  useEffect(() => {
    if (!dragging) return;
    const onMouseMove = (event: MouseEvent) => moveTo(event.clientX);
    const onTouchMove = (event: TouchEvent) => moveTo(event.touches[0].clientX);
    const stop = () => setDragging(null);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", stop);
    document.addEventListener("touchmove", onTouchMove);
    document.addEventListener("touchend", stop);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", stop);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", stop);
    };
  }, [dragging, moveTo]);

  const field = (label: string, value: number) => (
    <span className="flex h-11 flex-col justify-center rounded-xl border border-border bg-white px-3">
      <span className="font-sans text-[10px] font-semibold uppercase leading-none tracking-wider text-muted-foreground">{label}</span>
      <span className="font-quicksand text-sm font-bold tabular-nums leading-tight text-blue-yankees">{currencyFormatter.format(value)}</span>
    </span>
  );

  return (
    <FilterSection name="Precio" badge={isActive ? 1 : 0} defaultOpen={defaultOpen}>
      <div role="group" aria-label="Rango de precio" className="flex flex-col gap-4 pb-1 pt-1">
        <div className="grid grid-cols-2 gap-2">
          {field("Mínimo", minValue)}
          {field("Máximo", maxValue)}
        </div>
        <div ref={sliderRef} className="relative mx-2.5 h-5">
          <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border" />
          <span aria-hidden="true" className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-blue-yankees" style={{ left: `${minPercent}%`, right: `${100 - maxPercent}%` }} />
          {(["min", "max"] as const).map((type) => (
            <div
              key={type}
              role="slider"
              tabIndex={0}
              aria-label={type === "min" ? "Precio mínimo" : "Precio máximo"}
              aria-valuemin={type === "min" ? min : minValue + step}
              aria-valuemax={type === "min" ? maxValue - step : max}
              aria-valuenow={type === "min" ? minValue : maxValue}
              aria-valuetext={currencyFormatter.format(type === "min" ? minValue : maxValue)}
              className={cn(thumbClass, dragging === type && "z-20 scale-110")}
              style={{ left: `${type === "min" ? minPercent : maxPercent}%` }}
              onMouseDown={() => setDragging(type)}
              onTouchStart={() => setDragging(type)}
              onKeyDown={(event) => onKeyDown(type, event)}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRICE_PRESETS.map((preset) => {
            const selected = minValue === preset.min && maxValue === preset.max;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setMinValue(preset.min);
                  setMaxValue(preset.max);
                }}
                className={cn(
                  "inline-flex h-8 items-center rounded-full border-[1.5px] px-3 font-sans text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-1",
                  selected ? "border-blue-yankees bg-blue-yankees text-white" : "border-border bg-white text-blue-yankees hover:border-blue-yankees",
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>
    </FilterSection>
  );
};

export default PriceFilter;
