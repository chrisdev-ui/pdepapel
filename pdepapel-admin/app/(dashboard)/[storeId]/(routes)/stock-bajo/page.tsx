import { redirect } from "next/navigation";

/** Esta pantalla pasó a ser una vista de Inventario; la URL antigua sigue funcionando. */
export default function RedirectPage({ params }: { params: { storeId: string } }) {
  redirect(`/${params.storeId}/inventario?vista=por-reponer`);
}
