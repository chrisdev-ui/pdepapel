import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface OrderSectionProps {
  id: string;
  title: string;
  icon: LucideIcon;
  /** Tailwind background for the icon tile (kawaii tints). */
  tint: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Card with the icon-tile heading used across Nosotros, Contacto and the account pages. */
export function OrderSection({
  id,
  title,
  icon: Icon,
  tint,
  action,
  children,
  className,
}: OrderSectionProps) {
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-pink-shell/30 bg-white p-5 shadow-[0_4px_20px_hsl(280_30%_70%/0.15)] print:border-border print:shadow-none sm:p-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={cn(
              "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-blue-yankees",
              tint,
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
          <h2 id={id} className="font-serif text-xl font-bold text-blue-yankees">
            {title}
          </h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
