import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface SectionCardProps {
  id: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: "default" | "care";
}

/** Tarjeta de sección del pedido: título, ayuda de una línea y contenido. */
export function SectionCard({ id, title, description, action, children, className, tone = "default" }: SectionCardProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titulo`}
      className={cn(
        "scroll-mt-24 flex flex-col gap-4 rounded-xl border bg-white p-4 shadow-sm sm:p-5",
        tone === "care" && "border-tint-pink",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={`${id}-titulo`} className="text-[15px] font-bold text-primary">
            {title}
          </h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}
