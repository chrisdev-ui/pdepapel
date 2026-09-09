"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { SectionHeading } from "@/components/home/section-heading";
import { cn } from "@/lib/utils";

interface ScrollRailProps {
  children: React.ReactNode;
  ariaLabel: string;
  className?: string;
  /** Cabecera de la sección; las flechas se añaden a la derecha de `action`. */
  heading?: { id: string; title: string; eyebrow?: React.ReactNode; action?: React.ReactNode };
}

/**
 * Carrusel sin biblioteca: desplazamiento nativo con scroll-snap y dos flechas
 * que solo aparecen en pantallas con cursor.
 */
export function ScrollRail({ children, ariaLabel, className, heading }: ScrollRailProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ start: true, end: true });

  const update = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    const max = node.scrollWidth - node.clientWidth;
    setState({ start: node.scrollLeft <= 2, end: node.scrollLeft >= max - 2 });
  }, []);

  useEffect(() => {
    update();
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    node.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      node.removeEventListener("scroll", update);
    };
  }, [update]);

  const scrollBy = (direction: 1 | -1) => {
    const node = ref.current;
    if (!node) return;
    node.scrollBy({ left: direction * node.clientWidth * 0.8, behavior: "smooth" });
  };

  const controls = (
    <div className="hidden gap-2 can-hover:flex">
      <button
        type="button"
        aria-label="Anterior"
        onClick={() => scrollBy(-1)}
        disabled={state.start}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-blue-baby bg-white text-blue-yankees shadow-sm transition hover:bg-kawaii-blue-light disabled:opacity-30"
      >
        <ChevronLeft aria-hidden="true" className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="Siguiente"
        onClick={() => scrollBy(1)}
        disabled={state.end}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-blue-baby bg-white text-blue-yankees shadow-sm transition hover:bg-kawaii-blue-light disabled:opacity-30"
      >
        <ChevronRight aria-hidden="true" className="h-5 w-5" />
      </button>
    </div>
  );

  return (
    <>
      {heading && (
        <SectionHeading
          id={heading.id}
          title={heading.title}
          eyebrow={heading.eyebrow}
          action={
            <>
              {heading.action}
              {controls}
            </>
          }
        />
      )}
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        className={cn(
          "flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-4",
          className,
        )}
      >
        {children}
      </div>
    </>
  );
}
