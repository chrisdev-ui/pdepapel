import Link from "next/link";

import { CloudinaryImage } from "@/components/ui/cloudinary-image";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { currencyFormatter } from "@/lib/utils";
import type { CurrentCapsuleEdition } from "@/types/capsules";

/**
 * Banner del inicio mientras hay una edición de cápsulas a la venta. Sin
 * cupos del día (la caché es de 5 minutos) ni cifras de lo que vale el
 * contenido. El texto nunca va sobre la foto.
 */
export function CapsuleEditionBanner({ edition }: { edition: CurrentCapsuleEdition | null }) {
  if (!edition) return null;
  return (
    <section aria-labelledby="capsulas-banner-title" className="mx-auto max-w-screen-2xl px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
      <div className="grid overflow-hidden rounded-2xl bg-kawaii-lavender-light lg:grid-cols-[minmax(0,1fr)_minmax(0,40%)] lg:items-center lg:rounded-3xl">
        {edition.coverImage && (
          <CloudinaryImage
            src={edition.coverImage}
            alt=""
            width={960}
            height={540}
            sizes="(max-width: 1023px) 100vw, 40vw"
            className="order-1 aspect-[16/9] w-full object-cover lg:order-2 lg:aspect-auto lg:h-full"
          />
        )}
        <div className="order-2 flex flex-col gap-3 p-5 sm:p-8 lg:order-1 lg:p-10">
          <span className="font-sans text-xs font-bold uppercase tracking-[0.1em] text-blue-yankees">Cápsulas sorpresa · Edición #{edition.number}</span>
          <h2 id="capsulas-banner-title" className="text-balance font-serif text-2xl font-bold leading-tight text-blue-yankees sm:text-3xl lg:text-[2.1rem]">
            {edition.name}
          </h2>
          <p className="max-w-[46ch] font-sans text-base leading-relaxed text-blue-yankees">
            Cada cápsula trae el nombre de un producto de la colección y te lo enviamos en una caja. Pack de {edition.fromPack.packSize} por{" "}
            {currencyFormatter.format(edition.fromPack.total)}.
          </p>
          <Link
            href={STOREFRONT_ROUTES.capsules}
            prefetch={false}
            className="inline-flex h-12 w-fit items-center justify-center rounded-full bg-blue-yankees px-6 font-sans text-base font-bold text-white transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2"
          >
            Ver la edición
          </Link>
        </div>
      </div>
    </section>
  );
}
