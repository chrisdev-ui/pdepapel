import { Gift, Truck } from "lucide-react";

import { formatCop } from "@/lib/catalog-labels";
import { cn } from "@/lib/utils";

interface AnnouncementBarProps {
  freeShippingThreshold: number | null;
  className?: string;
}

function ColombiaFlag() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      role="img"
      aria-label="Colombia"
      className="shrink-0"
    >
      <clipPath id="announcement-flag">
        <circle cx="9" cy="9" r="9" />
      </clipPath>
      <g clipPath="url(#announcement-flag)">
        <rect width="18" height="9" fill="#FCD116" />
        <rect y="9" width="18" height="4.5" fill="#003893" />
        <rect y="13.5" width="18" height="4.5" fill="#CE1126" />
      </g>
      <circle
        cx="9"
        cy="9"
        r="8.5"
        fill="none"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="1"
      />
    </svg>
  );
}

/**
 * Top information bar. Messages slide horizontally one at a time (the
 * animation lives in globals.css as `announcement-slide`), pause on hover,
 * and collapse to the first message when the visitor prefers reduced motion.
 * The right end fixes the country so the site reads as P de Papel Colombia.
 */
export function AnnouncementBar({
  freeShippingThreshold,
  className,
}: AnnouncementBarProps) {
  const messages = [
    { icon: Truck, text: "Envíos a toda Colombia" },
    ...(freeShippingThreshold
      ? [
          {
            icon: Gift,
            text: `Envío gratis desde ${formatCop(freeShippingThreshold)}`,
          },
        ]
      : []),
  ];
  // Repeat the first message so the loop closes without a visible jump.
  const loop = messages.length > 1 ? [...messages, messages[0]] : messages;

  return (
    <div
      role="region"
      aria-label="Información de la tienda"
      className={cn(
        "announcement-bar flex h-8 items-center bg-blue-yankees px-3 font-sans text-[13px] font-medium text-white sm:px-6 lg:h-9 lg:px-12 lg:text-sm",
        className,
      )}
    >
      <div className="min-w-0 flex-1 overflow-hidden">
        <ul
          className={cn("flex h-full w-full", {
            "announcement-slide": loop.length > 1,
          })}
          aria-live="off"
        >
          {loop.map(({ icon: Icon, text }, index) => (
            <li
              key={`${text}-${index}`}
              aria-hidden={index === loop.length - 1 && loop.length > 1}
              className="flex h-8 w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap lg:h-9"
            >
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>
      <span
        aria-hidden="true"
        className="mx-3 h-4 w-px shrink-0 bg-white/35"
      />
      <span
        className="flex shrink-0 items-center gap-1.5 font-semibold"
        title="Estás en P de Papel Colombia"
      >
        <ColombiaFlag />
        Colombia
      </span>
    </div>
  );
}
