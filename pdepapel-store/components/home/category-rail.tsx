import { CloudinaryImage } from "@/components/ui/cloudinary-image";
import Link from "next/link";

import { ScrollRail } from "@/components/home/scroll-rail";
import { stripTaxonomyIcon } from "@/lib/catalog-labels";
import { categoryPath, STOREFRONT_ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { Category } from "@/types";

interface CategoryRailProps {
  categories: Category[];
  title?: string;
  moreHref?: string | null;
  className?: string;
}

const TINTS = ["bg-kawaii-pink-light", "bg-kawaii-blue-light", "bg-kawaii-yellow-light", "bg-kawaii-mint-light", "bg-kawaii-lavender-light", "bg-kawaii-peach"];
const BLOBS = ["blob-a", "blob-b", "blob-c"];
const BLOB_PATHS: Record<string, string> = {
  "blob-a": "M0.5,0.02 C0.74,-0.01,0.96,0.16,0.98,0.42 C1,0.68,0.84,0.96,0.56,0.99 C0.28,1.02,0.04,0.84,0.02,0.58 C0,0.32,0.26,0.05,0.5,0.02 Z",
  "blob-b": "M0.42,0.03 C0.68,-0.04,0.99,0.18,0.98,0.47 C0.97,0.74,0.82,1,0.52,0.99 C0.22,0.98,-0.01,0.78,0.02,0.48 C0.05,0.22,0.2,0.09,0.42,0.03 Z",
  "blob-c": "M0.55,0.01 C0.8,0.02,0.99,0.26,0.97,0.52 C0.95,0.78,0.76,1,0.48,0.99 C0.2,0.98,0.01,0.8,0.02,0.52 C0.03,0.24,0.28,0,0.55,0.01 Z",
};

/** Categorías como fotos recortadas en formas orgánicas, sin cajas. */
export function CategoryRail({ categories, title = "Explora por categoría", moreHref = STOREFRONT_ROUTES.shop, className }: CategoryRailProps) {
  if (categories.length === 0) return null;

  return (
    <section aria-labelledby="category-rail-title" className={cn("mx-auto flex max-w-screen-2xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8 lg:py-8", className)}>
      <svg width="0" height="0" aria-hidden="true" className="absolute">
        <defs>
          {BLOBS.map((id) => (
            <clipPath key={id} id={id} clipPathUnits="objectBoundingBox">
              <path d={BLOB_PATHS[id]} />
            </clipPath>
          ))}
        </defs>
      </svg>
      <ScrollRail
        ariaLabel={title}
        heading={{
          id: "category-rail-title",
          title,
          action: moreHref ? (
            <Link href={moreHref} className="font-sans text-sm font-semibold text-blue-yankees underline-offset-4 hover:underline">
              Ver todas
            </Link>
          ) : null,
        }}
      >
        {categories.map((category, index) => {
          const label = stripTaxonomyIcon(category.name);
          return (
            <Link
              key={category.id}
              href={categoryPath(category.slug || category.id)}
              className="group flex w-[7.5rem] shrink-0 snap-start flex-col items-center gap-2 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink focus-visible:ring-offset-2 sm:w-40 lg:w-44 xl:w-48"
            >
              <span className="relative block aspect-square w-full">
                <span aria-hidden="true" className={cn("absolute inset-[6%] rounded-full opacity-90 blur-[2px]", TINTS[index % TINTS.length])} />
                <span aria-hidden="true" className={cn("absolute right-[4%] top-[2%] h-[13%] w-[13%] rounded-full", TINTS[index % TINTS.length])} />
                <span aria-hidden="true" className={cn("absolute bottom-[6%] left-0 h-[8%] w-[8%] rounded-full", TINTS[index % TINTS.length])} />
                <span className="absolute inset-[8%] block overflow-hidden transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transform-none" style={{ clipPath: `url(#${BLOBS[index % BLOBS.length]})` }}>
                  {category.imageUrl ? (
                    <CloudinaryImage src={category.imageUrl} alt="" fill sizes="(max-width: 640px) 120px, 192px" className="object-cover" />
                  ) : (
                    <span className="block h-full w-full bg-gradient-to-br from-kawaii-pink-light to-kawaii-blue-light" />
                  )}
                </span>
              </span>
              <span className="text-center font-sans text-sm font-bold text-blue-yankees sm:text-[15px]">{label}</span>
            </Link>
          );
        })}
      </ScrollRail>
    </section>
  );
}
