import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getCapsuleEdition } from "@/actions/get-capsule-edition";
import { CapsuleConditions } from "@/components/capsules/capsule-conditions";
import { CapsuleEditionView } from "@/components/capsules/capsule-edition-view";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Container } from "@/components/ui/container";
import { STOREFRONT_ROUTES } from "@/lib/routes";

/** Siempre dinámica: los cupos cambian y una vista previa no se guarda para nadie. */
export const dynamic = "force-dynamic";

interface CapsuleEditionPageProps {
  params: { edicion: string };
  searchParams: { vista?: string };
}

export async function generateMetadata({ params, searchParams }: CapsuleEditionPageProps): Promise<Metadata> {
  const data = await getCapsuleEdition(params.edicion, searchParams.vista);
  const hidden = { index: false, follow: false, googleBot: { index: false, follow: false } };
  if (!data) return { title: "Cápsulas sorpresa", robots: hidden };
  // Se indexa solo la edición a la venta, vista sin enlace de vista previa.
  const indexable = data.salesEnabled && data.edition.status === "LIVE" && !data.preview;
  return {
    title: `Cápsulas sorpresa · Edición #${data.edition.number} ${data.edition.name}`,
    description: `1 cápsula = 1 producto sorpresa de la colección ${data.edition.name}. Elige tu pack y abrimos tus cápsulas para ti.`,
    robots: indexable ? { index: true, follow: true } : hidden,
    ...(indexable ? { alternates: { canonical: `/capsulas/${data.edition.segment}` } } : {}),
    referrer: "strict-origin",
  };
}

export default async function CapsuleEditionPage({ params, searchParams }: CapsuleEditionPageProps) {
  const data = await getCapsuleEdition(params.edicion, searchParams.vista);
  if (!data) notFound();
  return (
    <Container className="flex flex-col gap-6 py-6">
      <Breadcrumb
        items={[
          { label: "Tienda", href: STOREFRONT_ROUTES.shop },
          { label: `Cápsulas · ${data.edition.name}`, isCurrent: true },
        ]}
      />
      <CapsuleEditionView data={data} />
      <CapsuleConditions opensAt={data.day.opensAt} />
    </Container>
  );
}
