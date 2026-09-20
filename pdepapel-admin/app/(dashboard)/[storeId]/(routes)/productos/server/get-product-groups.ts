import { requireStoreRead } from "@/lib/store-access";
import prismadb from "@/lib/prismadb";

export const getProductGroups = async (storeId: string) => {
  // Solo id y nombre, pero la carga dice a quién deja entrar.
  await requireStoreRead(storeId);
  const groups = await prismadb.productGroup.findMany({
    where: {
      storeId,
    },
    select: {
      id: true,
      name: true,
      products: {
        select: {
          id: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return groups;
};
