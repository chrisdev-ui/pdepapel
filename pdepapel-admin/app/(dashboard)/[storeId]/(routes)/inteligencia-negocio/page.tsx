import { redirect } from "next/navigation";

/**
 * «Inteligencia de negocio» ya vive dentro de Reportes › Rendimiento, en la
 * vista «Productos y riesgos». Igual que `negocio`, esta ruta se queda como
 * redirección para no romper un enlace guardado. Ver el comentario de
 * `../negocio/page.tsx`.
 */
export default function BIDashboardPage({
  params,
  searchParams,
}: {
  params: { storeId: string };
  searchParams: { month?: string; year?: string };
}) {
  const query = new URLSearchParams({ tab: "detalle" });
  if (searchParams.month) query.set("month", searchParams.month);
  if (searchParams.year) query.set("year", searchParams.year);

  redirect(`/${params.storeId}/rendimiento?${query.toString()}`);
}
