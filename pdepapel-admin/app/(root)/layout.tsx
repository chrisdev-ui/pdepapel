import prismadb from "@/lib/prismadb";
import { auth } from "@clerk/nextjs";
import { redirect } from "next/navigation";

export default async function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = auth();
  if (!userId) {
    redirect("/iniciar-sesion");
  }
  let store = await prismadb.store.findFirst({ where: { userId } });

  if (!store && process.env.NODE_ENV === "development") {
    store = await prismadb.store.findFirst({
      where: { id: "4989cec3-307b-4dbb-af4b-114e21f7e00e" },
    });
  }

  if (store) {
    redirect(`/${store.id}`);
  }

  return <>{children}</>;
}
