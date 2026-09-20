import { AppShell } from "@/components/shell/app-shell";
import { StoreInitializer } from "@/components/store-initializer";
import { env } from "@/lib/env.mjs";
import { ConversationStatus } from "@prisma/client";

import { overduePresaleWhere } from "@/lib/presale";

import prismadb from "@/lib/prismadb";
import { getStoreAccess } from "@/lib/store-access";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { storeId: string };
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/iniciar-sesion");
  }
  // Entra la dueña o una cuenta de solo lectura con esta tienda permitida.
  // La escritura sigue cerrada en cada ruta: aquí solo se decide si se pinta
  // el panel. En desarrollo se mantiene el atajo de siempre, porque los ids
  // de Clerk de desarrollo no coinciden con los de la tienda real.
  const access = await getStoreAccess(params.storeId);
  const isDevelopment = process.env.NODE_ENV === "development";
  if (!access && !isDevelopment) {
    redirect("/");
  }
  const store = await prismadb.store.findFirst({
    where: { id: params.storeId },
  });
  if (!store) {
    redirect("/");
  }

  const [stores, pendingOrders, lowStock, conversationsNeedOwner, presalesOverdue] =
    await Promise.all([
    // El selector de tiendas de una cuenta de solo lectura muestra solo esta.
    access?.role === "viewer"
      ? Promise.resolve([store])
      : prismadb.store.findMany({ where: { userId } }),
    prismadb.order
      .count({ where: { storeId: params.storeId, status: "PENDING" } })
      .catch(() => 0),
    prismadb.product
      .count({
        where: { storeId: params.storeId, isArchived: false, stock: { lte: 2 } },
      })
      .catch(() => 0),
    // Conversaciones que el bot dejó para una persona. Usa el índice
    // [storeId, status, lastInboundAt], así que es una cuenta barata.
    prismadb.conversation
      .count({
        where: { storeId: params.storeId, status: ConversationStatus.NEEDS_OWNER },
      })
      .catch(() => 0),
    // Preventas con la fecha prometida ya vencida: le debemos un aviso a una
    // clienta que ya pagó, así que es lo más urgente de la barra.
    prismadb.productPresale
      .count({ where: { storeId: params.storeId, ...overduePresaleWhere() } })
      .catch(() => 0),
  ]);

  return (
    <>
      <StoreInitializer logoUrl={store.logoUrl} />
      <AppShell
        storeId={params.storeId}
        stores={stores}
        storeUrl={env.FRONTEND_STORE_URL}
        counts={{ pendingOrders, lowStock, conversationsNeedOwner, presalesOverdue }}
      >
        {children}
      </AppShell>
    </>
  );
}
