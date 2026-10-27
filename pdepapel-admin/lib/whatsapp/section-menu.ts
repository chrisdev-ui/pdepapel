import { availableStockWhere } from "@/lib/available-stock-where";
import { stripTaxonomyIcon } from "@/lib/category-seo";
import prismadb from "@/lib/prismadb";

/**
 * El menú de secciones para «algo barato», «buenos y baratos» o «qué tienen
 * económico»: sin palabra de producto no se enseñan sobres de manila de $400
 * (lo más barato de todo el catálogo), se pregunta qué busca con las secciones
 * que más se venden.
 *
 * Fuera del menú: empaques e insumos, que nadie busca como «algo barato».
 * La lista va aquí y en ningún otro sitio.
 */
export const SECTION_MENU_EXCLUDED = ["empaque", "sobre", "foami", "bolsa"] as const;

export const SECTION_MENU_SIZE = 5;

/** Cuántos de los más baratos por precio de lista se miran para el «desde» con ofertas. */
const CANDIDATOS_DESDE = 3;

/** Cuántas de las más vendidas se miran para hallar cinco con existencias. */
const CATEGORIAS_CANDIDATAS = 15;

const plano = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** La palabra, su plural y su diminutivo («bolsa», «bolsas», «bolsitas»). */
const formas = (w: string) => {
  const raiz = /[aeo]$/.test(w) ? w.slice(0, -1) : w;
  return `${w}(?:s|es)?|${raiz}(?:it[oa]s?|ecit[oa]s?)`;
};
const EXCLUIDA = new RegExp(`(?<![a-z0-9])(?:${SECTION_MENU_EXCLUDED.map(formas).join("|")})(?![a-z0-9])`);

/** Una categoría de empaques o insumos («Empaques para regalo», «Sobres», «Foami», «Bolsas de regalo»). */
export function isExcludedSection(name: string): boolean {
  return EXCLUIDA.test(plano(stripTaxonomyIcon(name)));
}

export interface MenuSection {
  categoryId: string;
  name: string;
  /** El precio más bajo con existencias, ya con ofertas. */
  from: number;
}

/**
 * Las secciones más vendidas que tienen algo para vender: las categorías
 * ordenadas por la suma de `soldCount` de sus productos activos, sin las
 * excluidas, cada una con su precio más bajo en existencia.
 */
export async function loadMenuSections(
  storeId: string,
  effectivePrices: (
    rows: { id: string; price: number; categoryId: string; productGroupId: string | null }[],
  ) => Promise<Map<string, number>>,
): Promise<MenuSection[]> {
  const ventas = await prismadb.product.groupBy({
    by: ["categoryId"],
    where: { storeId, isArchived: false },
    _sum: { soldCount: true },
  });
  const categorias = await prismadb.category.findMany({
    where: { storeId, isArchived: false, id: { in: ventas.map((v) => v.categoryId) } },
    select: { id: true, name: true },
  });
  const nombre = new Map(categorias.map((c) => [c.id, stripTaxonomyIcon(c.name).trim()]));
  const orden = ventas
    .filter((v) => nombre.has(v.categoryId) && !isExcludedSection(nombre.get(v.categoryId)!))
    .sort(
      (a, b) =>
        (b._sum.soldCount ?? 0) - (a._sum.soldCount ?? 0) ||
        nombre.get(a.categoryId)!.localeCompare(nombre.get(b.categoryId)!, "es"),
    );

  // Una consulta para todas y un solo cálculo de ofertas: por categoría, en
  // serie, el menú tardaba cuatro veces lo que una búsqueda normal.
  const candidatas = orden.slice(0, CATEGORIAS_CANDIDATAS).map((v) => v.categoryId);
  const productos = await prismadb.product.findMany({
    where: { storeId, isArchived: false, categoryId: { in: candidatas }, ...availableStockWhere() },
    orderBy: [{ price: "asc" }, { id: "asc" }],
    select: { id: true, price: true, categoryId: true, productGroupId: true },
  });
  const porCategoria = new Map<string, typeof productos>();
  for (const p of productos) {
    const lista = porCategoria.get(p.categoryId) ?? [];
    if (lista.length < CANDIDATOS_DESDE) lista.push(p);
    porCategoria.set(p.categoryId, lista);
  }
  const elegidas = candidatas.filter((id) => porCategoria.has(id)).slice(0, SECTION_MENU_SIZE);
  const filas = elegidas.flatMap((id) => porCategoria.get(id)!);
  const precios = filas.length > 0 ? await effectivePrices(filas) : new Map<string, number>();

  const secciones: MenuSection[] = elegidas.map((id) => ({
    categoryId: id,
    name: nombre.get(id)!,
    from: Math.min(...porCategoria.get(id)!.map((p) => precios.get(p.id) ?? Math.round(p.price))),
  }));
  return secciones;
}
