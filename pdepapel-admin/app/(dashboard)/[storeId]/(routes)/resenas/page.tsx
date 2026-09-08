import { redirect } from "next/navigation";

/** Las reseñas viven como pestaña de Clientes (rediseño 2026-09). */
export default function ReviewsPage({ params }: { params: { storeId: string } }) {
  redirect(`/${params.storeId}/clientes?tab=resenas`);
}
