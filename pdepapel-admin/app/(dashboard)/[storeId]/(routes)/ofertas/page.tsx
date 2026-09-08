import { redirect } from "next/navigation";

/** Las ofertas viven como pestaña de Promociones (rediseño 2026-09). */
export default function OffersPage({ params }: { params: { storeId: string } }) {
  redirect(`/${params.storeId}/promociones`);
}
