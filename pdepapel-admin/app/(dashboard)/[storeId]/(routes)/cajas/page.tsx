import { redirect } from "next/navigation";

/** Las cajas viven en Ajustes › Envíos y empaques (rediseño 2026-09). */
export default function BoxesPage({ params }: { params: { storeId: string } }) {
  redirect(`/${params.storeId}/configuracion?tab=envios`);
}
