import { pickCapsuleFloor } from "@/lib/capsule-suggestions";
import prismadb from "@/lib/prismadb";

/**
 * El único piso de margen de las cápsulas, para el taller (revisar margen,
 * guardar packs, imprimir, sugerir bolsa) y para las ediciones sugeridas:
 * el de la edición si lo tiene; si no, el margen mínimo de cápsulas de la
 * tienda; si no, el margen mínimo de la tienda. Sin edición (sugerir una
 * nueva) cuenta la más reciente.
 */
export async function resolveCapsuleFloor(storeId: string, edition?: { minMarginPct: number | null }) {
  const [store, latest] = await Promise.all([
    prismadb.store.findUnique({ where: { id: storeId }, select: { capsuleMinMarginPct: true, storeMinMarginPercent: true } }),
    edition ? Promise.resolve(null) : prismadb.capsuleEdition.findFirst({ where: { storeId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { number: true, name: true, minMarginPct: true } }),
  ]);
  const floor = pickCapsuleFloor({
    editionFloor: edition ? edition.minMarginPct : latest?.minMarginPct,
    capsuleFloor: store?.capsuleMinMarginPct,
    storeFloor: store?.storeMinMarginPercent,
  });
  return floor ? { ...floor, edition: floor.source === "edition" && latest ? { number: latest.number, name: latest.name } : null } : null;
}
