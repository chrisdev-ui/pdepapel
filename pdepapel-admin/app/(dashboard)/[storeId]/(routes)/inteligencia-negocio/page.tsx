import { requireStoreOwner } from "@/lib/store-access";

import { BiDashboard } from "./components/bi-dashboard";

export const revalidate = 0;

/**
 * Solo la dueña: aquí va el dinero de la casa —ventas netas, utilidad,
 * margen por producto y el retiro personal sugerido—. No hay versión
 * depurada para una cuenta de solo lectura; si algún día la agencia
 * necesita cifras, se le hace una vista aparte con unidades y campañas.
 */
export default async function BIDashboardPage(props: { params: { storeId: string }; searchParams: { month?: string; year?: string } }) {
  await requireStoreOwner(props.params.storeId);
  return <BiDashboard {...props} />;
}
