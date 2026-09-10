import { hasAdminAccess } from "@/lib/admin-access";
import prismadb from "@/lib/prismadb";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/iniciar-sesion");
  }
  let store = await prismadb.store.findFirst({ where: { userId } });

  // Local development runs with a Clerk development instance whose user ids
  // never match the production store owner, so fall back to any store (the
  // dashboard layout applies the same development-only bypass).
  if (!store && process.env.NODE_ENV === "development") {
    store = await prismadb.store.findFirst({ orderBy: { createdAt: "asc" } });
  }

  if (store) {
    redirect(`/${store.id}`);
  }

  // No store yet: only an allowlisted owner may create the first one. Any
  // other session (a shop customer on the panel's domain) is sent away
  // instead of being shown the store creator.
  if (!(await hasAdminAccess(userId))) {
    redirect("/sin-acceso");
  }

  return <>{children}</>;
}
