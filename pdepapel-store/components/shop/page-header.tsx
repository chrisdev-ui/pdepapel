import { LayoutGrid } from "lucide-react";
import Link from "next/link";
import { ReactNode } from "react";

import { CollapsibleIntro } from "@/components/shop/collapsible-intro";
import { CloudinaryImage } from "@/components/ui/cloudinary-image";
import { formatProductCount, tintForKey } from "@/lib/shop-filters";
import { cn } from "@/lib/utils";

export interface HeaderChip {
  label: string;
  href: string;
  icon?: ReactNode;
}

interface HeaderImage {
  url: string;
  alt: string;
}

interface PageHeaderProps {
  title: string;
  count: number;
  eyebrow?: { icon: ReactNode; label: string };
  intro?: string | null;
  /** Una foto (categoría) o hasta tres (tienda completa). */
  images: HeaderImage[];
  /** Clave estable para el tono pastel (id de categoría o «tienda»). */
  tintKey: string;
  chipsLabel?: string;
  chips?: HeaderChip[];
}

const BLOB_PATHS = [
  "M0.5,0.02 C0.74,-0.01,0.96,0.16,0.98,0.42 C1,0.68,0.84,0.96,0.56,0.99 C0.28,1.02,0.04,0.84,0.02,0.58 C0,0.32,0.26,0.05,0.5,0.02 Z",
  "M0.42,0.03 C0.68,-0.04,0.99,0.18,0.98,0.47 C0.97,0.74,0.82,1,0.52,0.99 C0.22,0.98,-0.01,0.78,0.02,0.48 C0.05,0.22,0.2,0.09,0.42,0.03 Z",
  "M0.55,0.01 C0.8,0.02,0.99,0.26,0.97,0.52 C0.95,0.78,0.76,1,0.48,0.99 C0.2,0.98,0.01,0.8,0.02,0.52 C0.03,0.24,0.28,0,0.55,0.01 Z",
];
const BLOB_TINTS = ["#FFD6E5", "#D6E3FF", "#FFF3CC", "#D6F5E9"];

export function CountChip({ count, className }: { count: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 font-sans text-[13px] font-bold text-blue-yankees shadow-[0_1px_2px_rgba(34,27,65,0.08)] lg:h-9 lg:px-3.5 lg:text-sm",
        className,
      )}
    >
      <LayoutGrid aria-hidden="true" className="h-[15px] w-[15px] text-muted-foreground" />
      {formatProductCount(count)}
    </span>
  );
}

function Blob({ image, index, sizes, className }: { image: HeaderImage; index: number; sizes: string; className?: string }) {
  const tint = BLOB_TINTS[index % BLOB_TINTS.length];
  const clipId = `hdr-blob-${index % BLOB_PATHS.length}`;
  return (
    <span className={cn("relative block", className)}>
      <span aria-hidden="true" className="absolute inset-[4%] rounded-full opacity-95 blur-[3px]" style={{ background: tint }} />
      <span aria-hidden="true" className="absolute right-[2%] top-0 h-[14%] w-[14%] rounded-full" style={{ background: tint }} />
      <span aria-hidden="true" className="absolute -left-[2%] bottom-[4%] h-[9%] w-[9%] rounded-full" style={{ background: tint }} />
      <span className="absolute inset-[8%] block overflow-hidden" style={{ clipPath: `url(#${clipId})` }}>
        <CloudinaryImage src={image.url} alt={image.alt} fill sizes={sizes} className="object-cover" />
      </span>
    </span>
  );
}

/**
 * Banda de cabecera de la tienda y las categorías: tono pastel, título serif,
 * chip de conteo, intro plegable, atajos y la foto recortada en burbuja.
 */
export function PageHeader({ title, count, eyebrow, intro, images, tintKey, chipsLabel, chips = [] }: PageHeaderProps) {
  const tint = tintForKey(tintKey);
  const [cover, ...extra] = images;

  return (
    <section
      aria-labelledby="catalog-title"
      className={cn("relative overflow-hidden rounded-2xl px-4 py-5 sm:px-6 lg:rounded-3xl lg:px-10 lg:py-8", tint.bg)}
    >
      <svg width="0" height="0" aria-hidden="true" className="absolute">
        <defs>
          {BLOB_PATHS.map((path, index) => (
            <clipPath key={path} id={`hdr-blob-${index}`} clipPathUnits="objectBoundingBox">
              <path d={path} />
            </clipPath>
          ))}
        </defs>
      </svg>
      <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/45" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-16 left-[38%] h-36 w-36 rounded-full bg-white/35" />

      <div className="relative flex items-center gap-4 lg:gap-10">
        <div className="flex min-w-0 flex-1 flex-col gap-2.5 lg:gap-3">
          {eyebrow && (
            <span className="inline-flex items-center gap-2 font-sans text-[11px] font-bold uppercase tracking-[0.1em] text-blue-yankees/70 lg:text-xs">
              {eyebrow.icon}
              {eyebrow.label}
            </span>
          )}
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
            <h1 id="catalog-title" className="text-balance font-serif text-[30px] font-bold leading-[1.05] text-blue-yankees sm:text-4xl lg:text-[44px]">
              {title}
            </h1>
            <CountChip count={count} />
          </div>
          {intro && <CollapsibleIntro text={intro} />}
          {chips.length > 0 && (
            <div className="hidden flex-wrap items-center gap-2 lg:flex">
              {chipsLabel && <span className="font-sans text-[13px] font-semibold text-blue-yankees/70">{chipsLabel}</span>}
              {chips.map((chip) => (
                <Link
                  key={chip.href}
                  href={chip.href}
                  className="inline-flex h-9 items-center gap-2 rounded-full border-[1.5px] border-blue-yankees/15 bg-white/80 px-3.5 font-sans text-[13px] font-semibold text-blue-yankees transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2"
                >
                  {chip.icon}
                  {chip.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        {cover && extra.length === 0 && (
          <Blob image={cover} index={1} sizes="(max-width: 1023px) 96px, 200px" className="h-24 w-24 shrink-0 lg:h-[200px] lg:w-[200px]" />
        )}
        {cover && extra.length > 0 && (
          <div className="relative h-24 w-[110px] shrink-0 lg:h-[200px] lg:w-[260px]">
            <Blob image={cover} index={0} sizes="(max-width: 1023px) 64px, 132px" className="absolute left-0 top-0 h-16 w-16 lg:h-[132px] lg:w-[132px]" />
            {extra[0] && (
              <Blob image={extra[0]} index={2} sizes="(max-width: 1023px) 54px, 108px" className="absolute right-0 top-1 h-[54px] w-[54px] lg:top-2.5 lg:h-[108px] lg:w-[108px]" />
            )}
            {extra[1] && (
              <Blob image={extra[1]} index={1} sizes="(max-width: 1023px) 50px, 96px" className="absolute bottom-0 left-11 h-[50px] w-[50px] lg:left-24 lg:h-24 lg:w-24" />
            )}
          </div>
        )}
      </div>
    </section>
  );
}
