import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { canCreateStore } from "@/lib/admin-access";

import { OpenStoreCreator } from "./components/open-store-creator";

/**
 * Solo se llega aquí sin tener ninguna tienda. Abrir el creador exige la
 * autorización explícita del dueño (`ADMIN_ALLOWED_USER_IDS`): sin ella la
 * pantalla no ofrece crear nada y la sesión sale a «sin acceso».
 */
export default async function Home() {
  const { userId } = await auth();
  if (!userId) redirect("/iniciar-sesion");
  if (!canCreateStore(userId)) redirect("/sin-acceso");

  return <OpenStoreCreator />;
}
