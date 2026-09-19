import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import prismadb from "@/lib/prismadb";

/**
 * Páginas para imprimir: misma autenticación que el panel (dueña de la
 * tienda), sin la barra lateral ni el resto del cascarón. Lo que se pinta
 * aquí es lo que sale por la impresora.
 */
export default async function PrintLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { storeId: string };
}) {
  const { userId } = await auth();
  if (!userId) redirect("/iniciar-sesion");
  const store = await prismadb.store.findFirst({
    where: {
      id: params.storeId,
      ...(process.env.NODE_ENV === "development" ? {} : { userId }),
    },
    select: { id: true },
  });
  if (!store) redirect("/");
  return <div className="min-h-screen bg-white text-slate-900">{children}</div>;
}
