import Link from "next/link";

import { EarlyAccessForm } from "@/components/home/early-access-form";
import { CloudinaryImage } from "@/components/ui/cloudinary-image";
import { canonicalStorefrontHref, productPath, STOREFRONT_ROUTES } from "@/lib/routes";
import { HomeContent } from "@/types";

/** Solo existe mientras hay una campaña vigente en el panel. */
export function CampaignBanner({ campaign }: { campaign: HomeContent | null }) {
  if (!campaign) return null;
  const isShipment = campaign.campaignType === "SHIPMENT";
  const teasers = isShipment ? campaign.products.slice(0, 3) : [];
  const showTeasers = teasers.length > 0;

  return (
    <section aria-labelledby="campaign-title" className="mx-auto max-w-screen-2xl px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
      <div className="grid overflow-hidden rounded-2xl bg-pink-shell lg:grid-cols-[minmax(0,1fr)_minmax(0,44%)] lg:items-center lg:rounded-3xl">
        {!showTeasers && campaign.imageUrl && (
          <CloudinaryImage
            src={campaign.imageUrl}
            alt={campaign.imageAlt ?? ""}
            width={1040}
            height={600}
            sizes="(max-width: 1023px) 100vw, 44vw"
            className="order-1 aspect-[16/9] w-full object-cover lg:order-2 lg:h-full lg:aspect-auto"
          />
        )}
        <div className="order-2 flex flex-col gap-4 p-5 sm:p-8 lg:order-1 lg:p-10">
          {campaign.eyebrow && (
            <span className="font-sans text-xs font-bold uppercase tracking-[0.1em] text-blue-yankees">{campaign.eyebrow}</span>
          )}
          <h2 id="campaign-title" className="text-balance font-serif text-2xl font-bold leading-tight text-blue-yankees sm:text-3xl lg:text-[2.1rem]">
            {campaign.title}
          </h2>
          {campaign.subtitle && <p className="max-w-[46ch] font-sans text-base leading-relaxed text-blue-yankees/90">{campaign.subtitle}</p>}
          {isShipment ? (
            <EarlyAccessForm label={campaign.primaryLabel || "Quiero acceso anticipado"} source="portada-banner" />
          ) : (
            campaign.primaryLabel &&
            campaign.primaryUrl && (
              <Link
                href={canonicalStorefrontHref(campaign.primaryUrl)}
                className="inline-flex h-12 w-fit items-center justify-center rounded-full bg-blue-yankees px-6 font-sans text-base font-bold text-white transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2"
              >
                {campaign.primaryLabel}
              </Link>
            )
          )}
        </div>
        {showTeasers && (
          <div className="order-1 flex flex-col gap-2 px-5 pt-5 sm:px-8 sm:pt-8 lg:order-2 lg:p-10">
            <ul className="flex gap-3 sm:gap-4">
              {teasers.map((product) => (
                <li key={product.id} className="flex w-[7rem] flex-col gap-1.5 sm:w-[8.25rem]">
                  <Link href={productPath(product.slug || product.id)} className="group relative block aspect-square overflow-hidden rounded-2xl border-2 border-white bg-white shadow-md">
                    {product.imageUrl ? (
                      <CloudinaryImage src={product.imageUrl} alt={product.name} fill sizes="132px" className="object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transform-none" />
                    ) : null}
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-blue-yankees px-2 py-0.5 font-sans text-[11px] font-bold text-white">Llega pronto</span>
                  </Link>
                  <span className="line-clamp-2 text-center font-sans text-xs font-semibold leading-tight text-blue-yankees">{product.name}</span>
                </li>
              ))}
            </ul>
            <Link href={STOREFRONT_ROUTES.comingSoon} className="font-sans text-sm font-semibold text-blue-yankees underline underline-offset-4">
              Ver todo lo que viene
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
