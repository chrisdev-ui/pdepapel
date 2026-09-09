import { Check } from "lucide-react";
import Link from "next/link";

import { CloudinaryImage } from "@/components/ui/cloudinary-image";
import { canonicalStorefrontHref, STOREFRONT_ROUTES } from "@/lib/routes";
import { getTrustPoints } from "@/lib/trust-points";
import { HomeContent } from "@/types";

interface HeroProps {
  content: HomeContent | null;
  freeShippingThreshold: number | null;
}

const DEFAULT_HERO = {
  eyebrow: null,
  title: "Papelería kawaii desde Medellín con envíos a toda Colombia",
  subtitle:
    "Agendas, cuadernos, útiles y regalos que dan ganas de estudiar. Pago en línea seguro o transferencia, y tu pedido sale de Medellín en 1 a 2 días hábiles.",
  primaryLabel: "Ver la tienda",
  primaryUrl: STOREFRONT_ROUTES.shop,
  secondaryLabel: "Ver novedades",
  secondaryUrl: `${STOREFRONT_ROUTES.shop}?sortOption=dateAdded`,
  imageUrl: null,
  imageAlt: null,
};

export function Hero({ content, freeShippingThreshold }: HeroProps) {
  const hero = { ...DEFAULT_HERO, ...(content ?? {}) };
  const promises = getTrustPoints(freeShippingThreshold).map((point) => point.title);

  return (
    <section
      aria-labelledby="hero-title"
      className="mx-auto grid max-w-screen-2xl gap-6 px-4 pb-6 pt-2 sm:px-6 md:grid-cols-2 md:items-center md:gap-8 md:py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,46%)] lg:gap-12 lg:px-8 lg:py-10"
    >
      <div className="order-2 flex flex-col gap-5 md:order-1 lg:max-w-xl">
        {hero.eyebrow && (
          <span className="inline-flex w-fit items-center rounded-full bg-kawaii-lavender-light px-3 py-1 font-sans text-xs font-semibold text-blue-yankees sm:text-sm">
            {hero.eyebrow}
          </span>
        )}
        <h1
          id="hero-title"
          className="text-balance font-serif text-3xl font-bold leading-[1.08] text-blue-yankees sm:text-4xl xl:text-5xl"
        >
          {hero.title}
        </h1>
        {hero.subtitle && (
          <p className="text-pretty max-w-[46ch] text-base leading-relaxed text-blue-yankees/80 sm:text-lg">
            {hero.subtitle}
          </p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {hero.primaryLabel && hero.primaryUrl && (
            <Link
              href={canonicalStorefrontHref(hero.primaryUrl)}
              className="inline-flex h-12 items-center justify-center rounded-full bg-blue-yankees px-7 font-sans text-base font-bold text-white transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2"
            >
              {hero.primaryLabel}
            </Link>
          )}
          {hero.secondaryLabel && hero.secondaryUrl && (
            <Link
              href={canonicalStorefrontHref(hero.secondaryUrl)}
              className="hidden h-12 items-center justify-center rounded-full border-2 border-blue-yankees px-5 font-sans text-base font-semibold text-blue-yankees transition-colors hover:bg-blue-yankees hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2 sm:inline-flex"
            >
              {hero.secondaryLabel}
            </Link>
          )}
        </div>
        <ul className="flex flex-col gap-2 font-sans text-sm font-medium text-blue-yankees/80 sm:flex-row sm:flex-wrap sm:gap-x-5">
          {promises.map((promise) => (
            <li key={promise} className="inline-flex items-center gap-2">
              <Check aria-hidden="true" className="h-4 w-4 text-green-600" />
              {promise}
            </li>
          ))}
        </ul>
      </div>
      <div className="order-1 overflow-hidden rounded-2xl bg-kawaii-pink-light md:order-2 lg:rounded-3xl">
        {hero.imageUrl ? (
          <CloudinaryImage
            src={hero.imageUrl}
            alt={hero.imageAlt ?? hero.title}
            width={1280}
            height={800}
            sizes="(max-width: 1023px) 100vw, 46vw"
            priority
            className="aspect-[4/3] w-full object-cover sm:aspect-[8/5] md:aspect-square lg:aspect-[8/5]"
          />
        ) : (
          <div aria-hidden="true" className="aspect-[4/3] w-full bg-gradient-to-br from-kawaii-pink-light via-kawaii-lavender-light to-kawaii-blue-light sm:aspect-[8/5]" />
        )}
      </div>
    </section>
  );
}
