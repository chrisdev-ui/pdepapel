import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { capsuleEditionPath, getCurrentCapsuleEdition } from "@/actions/get-current-capsule-edition";
import { Newsletter } from "@/components/newsletter";
import { Container } from "@/components/ui/container";
import { BASE_URL } from "@/constants";
import { withUtmParams } from "@/lib/capsule-links";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { STORE_INSTAGRAM_URL, STORE_TIKTOK_URL } from "@/lib/social-links";

/**
 * La dirección fija de las cápsulas (la de la bio de Instagram y TikTok). Con
 * una edición a la venta lleva a ella (307: el destino cambia con cada
 * edición); entre ediciones muestra «Entre ediciones». Dinámica a la fuerza:
 * sin edición no lee la consulta y Next la prerenderizaba; al aparecer una
 * edición, leer los `utm_*` daba 500. La edición LIVE sí sale de la caché de
 * 5 minutos (su `fetch` lleva `revalidate` explícito).
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { salesEnabled } = await getCurrentCapsuleEdition();
  return {
    title: "Cápsulas sorpresa",
    description: "Cápsulas sorpresa de Papelería P de Papel: cada cápsula trae el nombre de un producto de la colección. Mira cuándo sale la próxima edición.",
    alternates: { canonical: STOREFRONT_ROUTES.capsules },
    ...(salesEnabled ? {} : { robots: { index: false, follow: false } }),
    openGraph: { title: "Cápsulas sorpresa | Papelería P de Papel", url: `${BASE_URL}${STOREFRONT_ROUTES.capsules}` },
  };
}

export default async function CapsulesPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const { salesEnabled, edition } = await getCurrentCapsuleEdition();
  if (!salesEnabled) notFound();
  if (edition) redirect(withUtmParams(capsuleEditionPath(edition), searchParams));

  const social = "inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-blue-yankees px-5 font-sans text-base font-bold text-blue-yankees transition-colors hover:bg-blue-yankees hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2";
  return (
    <>
      <Container className="flex flex-col gap-5 py-10 sm:py-14">
        <span className="font-sans text-xs font-bold uppercase tracking-[0.1em] text-blue-yankees">Cápsulas sorpresa</span>
        <h1 className="text-balance font-serif text-3xl font-bold leading-tight text-blue-yankees sm:text-4xl">Entre ediciones</h1>
        <p className="max-w-[60ch] font-sans text-base leading-relaxed text-blue-yankees">
          La próxima edición sale pronto. En cada edición, cada cápsula trae el nombre de un producto de la colección, y te enviamos los productos en una caja.
        </p>
        <p className="max-w-[60ch] font-sans text-base leading-relaxed text-blue-yankees">
          Avisamos primero en Instagram y TikTok, y por correo a quien está suscrito al boletín.
        </p>
        <div className="flex flex-wrap gap-3">
          <a href={STORE_INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className={social}>
            Instagram
          </a>
          <a href={STORE_TIKTOK_URL} target="_blank" rel="noopener noreferrer" className={social}>
            TikTok
          </a>
          <Link href={STOREFRONT_ROUTES.shop} className="inline-flex min-h-[44px] items-center font-sans text-base font-semibold text-blue-yankees underline underline-offset-4">
            Ver la tienda
          </Link>
        </div>
      </Container>
      <Newsletter source="capsulas-entre-ediciones" />
    </>
  );
}
