import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import prismadb from "@/lib/prismadb";

/**
 * Páginas que se abren en el celular (escáner remoto): misma autenticación
 * que el panel, sin la barra lateral ni el cascarón. Sin sesión, Clerk manda
 * a iniciar sesión y vuelve aquí con el mismo enlace.
 */
export default async function RemoteLayout({
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
    select: { id: true, name: true },
  });
  if (!store) redirect("/");
  return <div className="min-h-screen bg-slate-50 text-slate-900">{children}</div>;
}
