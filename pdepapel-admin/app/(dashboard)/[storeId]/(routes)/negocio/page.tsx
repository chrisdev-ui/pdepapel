import { redirect } from "next/navigation";

/**
 * «Negocio y crecimiento» ya vive dentro de Reportes › Rendimiento.
 *
 * Esta ruta quedó fuera del menú cuando se armó Rendimiento, pero seguía
 * respondiendo: la misma pantalla en dos direcciones, y solo una con la
 * cabecera nueva. Se conserva como redirección porque puede estar guardada en
 * los favoritos de alguien; borrarla rompería ese enlace sin avisar.
 */
interface BusinessGrowthPageProps {
  params: { storeId: string };
  searchParams: { month?: string | string[]; year?: string | string[] };
}

export default function BusinessGrowthPage({
  params,
  searchParams,
}: BusinessGrowthPageProps) {
  const query = new URLSearchParams();
  if (typeof searchParams.month === "string")
    query.set("month", searchParams.month);
  if (typeof searchParams.year === "string")
    query.set("year", searchParams.year);
  const suffix = query.toString();

  redirect(`/${params.storeId}/rendimiento${suffix ? `?${suffix}` : ""}`);
}
