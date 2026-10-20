import { getCapsuleEdition } from "@/lib/capsule-editions";
import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/store-access";

/** Solo la dueña: la bolsa lleva el costo de cada papel. */
export async function getEditionWorkspace(storeId: string, editionId: string) {
  await requireStoreOwner(storeId);
  const [detail, categories, store] = await Promise.all([
    getCapsuleEdition(storeId, editionId),
    prismadb.category.findMany({ where: { storeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prismadb.store.findUnique({ where: { id: storeId }, select: { storeMinMarginPercent: true } }),
  ]);
  return { ...detail, categories, minMarginPct: store?.storeMinMarginPercent ?? null };
}

export type EditionWorkspaceData = Awaited<ReturnType<typeof getEditionWorkspace>>;
