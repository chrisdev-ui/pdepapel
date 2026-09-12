import { redirect } from "next/navigation";

/**
 * La lista vive en el hub de Atributos; esta ruta solo conserva los enlaces
 * antiguos y la vista (`?vista=archivados`) al redirigir.
 */
export default function SizesPage({
  params,
  searchParams,
}: {
  params: { storeId: string };
  searchParams?: { vista?: string | string[] };
}) {
  const query = new URLSearchParams({ tab: "tamanos" });
  const vista = Array.isArray(searchParams?.vista) ? searchParams?.vista[0] : searchParams?.vista;
  if (vista === "archivados") query.set("vista", vista);
  redirect(`/${params.storeId}/atributos?${query.toString()}`);
}
