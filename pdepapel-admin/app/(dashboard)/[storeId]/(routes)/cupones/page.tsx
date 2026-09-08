import { redirect } from "next/navigation";

/** Los cupones viven como pestaña de Promociones (rediseño 2026-09). */
export default function CouponsPage({ params }: { params: { storeId: string } }) {
  redirect(`/${params.storeId}/promociones?tab=cupones`);
}
