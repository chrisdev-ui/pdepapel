import { redirect } from "next/navigation";

/**
 * La lista de categorías vive en el centro de Atributos; esta ruta solo
 * conserva los enlaces antiguos (`/[storeId]/tipos`), incluida la vista de archivados.
 */
export default function TypesPage({
  params,
  searchParams,
}: {
  params: { storeId: string };
  searchParams?: { vista?: string };
}) {
  const archived = searchParams?.vista === "archivados" ? "&vista=archivados" : "";
  redirect(`/${params.storeId}/atributos?tab=categorias${archived}`);
}
