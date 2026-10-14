import { availableStockWhere } from "@/lib/available-stock-where";
import prismadb from "@/lib/prismadb";
import { productNameTokenSearchWhere, productTokenSearchWhere, searchTokens } from "@/lib/search-terms";
import { MIN_SEARCH_TOKENS } from "@/lib/whatsapp/bot-products";

/**
 * Cuántos productos en existencia daría la búsqueda del bot nuevo: primero por
 * nombre y, si nada, por descripción, con el presupuesto si lo dijo. Solo
 * cuenta; no arma respuesta ni llama a ningún modelo. `null` = la búsqueda no
 * corre (menos de dos palabras útiles, como el bot real; lo que se suma a un
 * pedido acepta una sola palabra porque exige un único resultado).
 */
export async function countInStockMatches(
  storeId: string,
  query: string,
  maxPrice: number | null,
  { minTokens = MIN_SEARCH_TOKENS }: { minTokens?: number } = {},
): Promise<number | null> {
  if (searchTokens(query).length < minTokens) return null;
  const byName = productNameTokenSearchWhere(query);
  if (byName.length === 0) return null;
  const base = { storeId, isArchived: false, ...availableStockWhere(), ...(maxPrice ? { price: { lte: maxPrice } } : {}) };
  const first = await prismadb.product.count({ where: { ...base, AND: byName } });
  if (first > 0) return first;
  return prismadb.product.count({ where: { ...base, AND: productTokenSearchWhere(query) } });
}
