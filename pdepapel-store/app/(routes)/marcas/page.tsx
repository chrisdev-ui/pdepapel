import { Metadata } from "next";
import Link from "next/link";

import { getBrands } from "@/actions/get-brands";
import { BrandLogo } from "@/components/brands/brand-logo";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Container } from "@/components/ui/container";
import { BASE_URL, DEFAULT_SHARE_IMAGE } from "@/constants";
import { canShowBrandLogo } from "@/lib/brand-display";
import { brandPath, STOREFRONT_ROUTES } from "@/lib/routes";

export const revalidate = 300;
export const maxDuration = 30;

const DESCRIPTION = "Las marcas originales que encuentras en Papelería P de Papel: cuadernos, colores, agendas y más, con envío a toda Colombia.";

export async function generateMetadata(): Promise<Metadata> {
  const brands = await getBrands();
  const index = brands.length > 0;
  const canonical = `${BASE_URL}${STOREFRONT_ROUTES.brands}`;
  return {
    title: "Marcas",
    description: DESCRIPTION,
    robots: { index, follow: true },
    alternates: { canonical },
    openGraph: { title: "Marcas | Papelería P de Papel", description: DESCRIPTION, url: canonical, siteName: "Papelería P de Papel", locale: "es_CO", type: "website", images: [DEFAULT_SHARE_IMAGE] },
  };
}

/** Índice de marcas visibles con productos: logo (si hay permiso) o el nombre, y el nombre debajo. */
export default async function BrandsIndexPage() {
  const brands = await getBrands();
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: BASE_URL },
      { "@type": "ListItem", position: 2, name: "Marcas", item: `${BASE_URL}${STOREFRONT_ROUTES.brands}` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <Container className="flex flex-col gap-y-5 px-4 pb-12 pt-2 sm:px-6 lg:px-8 lg:pt-5">
        <Breadcrumb items={[{ label: "Marcas", isCurrent: true }]} />
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-[30px] font-bold leading-[1.05] text-blue-yankees sm:text-4xl lg:text-[44px]">Marcas</h1>
          <p className="max-w-2xl font-sans text-[15px] text-gray-600">Productos originales de las marcas que más te gustan.</p>
        </div>
        {brands.length === 0 ? (
          <p role="status" className="rounded-2xl border-[1.5px] border-dashed border-blue-baby px-6 py-10 text-center font-sans text-[15px] text-gray-600">
            Pronto tendremos marcas para mostrarte.{" "}
            <Link href={STOREFRONT_ROUTES.shop} prefetch={false} className="font-semibold text-blue-yankees underline underline-offset-4">
              Ver toda la tienda
            </Link>
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
            {brands.map((brand) => (
              <li key={brand.id}>
                <Link
                  href={brandPath(brand.slug)}
                  prefetch={false}
                  className="flex h-full flex-col items-center gap-3 rounded-2xl border border-blue-baby bg-white p-4 text-center transition-shadow hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2"
                >
                  <span className="flex h-20 w-full items-center justify-center">
                    {canShowBrandLogo(brand) ? (
                      <BrandLogo brand={brand} width={120} height={80} sizeClassName="h-20 w-[120px]" alt="" />
                    ) : (
                      <span aria-hidden="true" className="inline-flex min-h-[2.75rem] items-center rounded-full bg-kawaii-lavender-light px-4 font-sans text-base font-bold text-blue-yankees">
                        {brand.name}
                      </span>
                    )}
                  </span>
                  <span className="font-sans text-[15px] font-semibold text-blue-yankees">{brand.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </>
  );
}
