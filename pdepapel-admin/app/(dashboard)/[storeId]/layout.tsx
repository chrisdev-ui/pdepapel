import { AppShell } from "@/components/shell/app-shell";
import { StoreInitializer } from "@/components/store-initializer";
import { env } from "@/lib/env.mjs";
import prismadb from "@/lib/prismadb";
import { auth } from "@clerk/nextjs";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { storeId: string };
}) {
  const { userId } = auth();
  if (!userId) {
    redirect("/iniciar-sesion");
  }
  const store = await prismadb.store.findFirst({
    where: {
      id: params.storeId,
      ...(process.env.NODE_ENV === "development" ? {} : { userId }),
    },
  });
  if (!store) {
    redirect("/");
  }

  const [stores, pendingOrders, lowStock] = await Promise.all([
    prismadb.store.findMany({ where: { userId } }),
    prismadb.order
      .count({ where: { storeId: params.storeId, status: "PENDING" } })
      .catch(() => 0),
    prismadb.product
      .count({
        where: { storeId: params.storeId, isArchived: false, stock: { lte: 2 } },
      })
      .catch(() => 0),
  ]);

  return (
    <>
      <StoreInitializer logoUrl={store.logoUrl} />
      <AppShell
        storeId={params.storeId}
        stores={stores}
        storeUrl={env.FRONTEND_STORE_URL}
        counts={{ pendingOrders, lowStock }}
      >
        {children}
      </AppShell>
    </>
  );
}
