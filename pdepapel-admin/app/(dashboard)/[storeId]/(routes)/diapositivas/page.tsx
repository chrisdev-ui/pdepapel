import { redirect } from "next/navigation";

/** Esta lista vive como pestaña de Contenido de la tienda (rediseño 2026-09). */
export default function RedirectPage({ params }: { params: { storeId: string } }) {
  redirect(`/${params.storeId}/contenido`);
}
