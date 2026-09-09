"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface CollapsibleIntroProps {
  text: string;
  className?: string;
}

/** Intro recortada a dos líneas; «Leer más» solo aparece si el texto no cabe. */
export function CollapsibleIntro({ text, className }: CollapsibleIntroProps) {
  const id = useId();
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setOverflows(node.scrollHeight > node.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text]);

  return (
    <div className={cn("flex flex-col items-start gap-1", className)}>
      <p
        id={id}
        ref={ref}
        className={cn("max-w-[60ch] font-sans text-[15px] leading-relaxed text-blue-yankees/80 lg:text-base", !expanded && "line-clamp-2")}
      >
        {text}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex items-center gap-1 rounded font-sans text-sm font-semibold text-blue-yankees underline underline-offset-4 decoration-blue-yankees/40 hover:decoration-blue-yankees focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2"
        >
          {expanded ? "Leer menos" : "Leer más"}
          <ChevronDown aria-hidden="true" className={cn("h-4 w-4", expanded && "rotate-180")} />
        </button>
      )}
    </div>
  );
}
