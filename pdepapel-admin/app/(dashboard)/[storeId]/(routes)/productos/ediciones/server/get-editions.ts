import { listCapsuleEditions } from "@/lib/capsule-editions";
import { requireStoreOwner } from "@/lib/store-access";

/** Solo la dueña: las ediciones llevan costos y la banda. */
export async function getEditions(storeId: string) {
  await requireStoreOwner(storeId);
  return listCapsuleEditions(storeId);
}

export type EditionListRow = Awaited<ReturnType<typeof getEditions>>[number];
