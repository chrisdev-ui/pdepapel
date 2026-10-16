/**
 * Las preguntas de ejemplo del copiloto: las sugerencias del chat vacío y el
 * capítulo del manual salen de esta lista. Cada una nombra la herramienta que
 * la responde; la evaluación (scripts/copilot-eval) comprueba que la llama.
 */
export interface CopilotExample {
  pregunta: string;
  tema: CopilotExampleTopic;
  herramienta: string;
  /** Primer tramo de la ruta del panel donde se sugiere (`?desde=`). */
  pantallas: readonly string[];
  /** También en el chat abierto sin pantalla. */
  general?: boolean;
}

export const COPILOT_EXAMPLE_TOPICS = ["El día", "Dinero del mes", "Punto de venta", "Catálogo", "Inventario", "Impuestos", "Mercado Libre", "Promoción y redes", "Textos y kits", "Precios"] as const;
export type CopilotExampleTopic = (typeof COPILOT_EXAMPLE_TOPICS)[number];

export const COPILOT_EXAMPLES: readonly CopilotExample[] = [
  { pregunta: "¿Cómo voy hoy?", tema: "El día", herramienta: "resumenDeHoy", pantallas: ["inicio"], general: true },
  { pregunta: "¿Cuántos pedidos tengo pendientes?", tema: "El día", herramienta: "resumenDeHoy", pantallas: ["pedidos", "envios"] },
  { pregunta: "¿Cuál fue mi margen este mes?", tema: "Dinero del mes", herramienta: "resumenFinancieroMes", pantallas: ["rendimiento", "negocio", "inteligencia-negocio"] },
  { pregunta: "¿Cómo me fue este mes frente al anterior?", tema: "Dinero del mes", herramienta: "compararMeses", pantallas: ["inicio", "rendimiento", "negocio", "inteligencia-negocio"] },
  { pregunta: "¿Cuánto vendí en el punto de venta ayer?", tema: "Punto de venta", herramienta: "ventasDelDiaPuntoDeVenta", pantallas: ["ventas-rapidas", "pedidos"] },
  { pregunta: "Busca las libretas con stock", tema: "Catálogo", herramienta: "buscarProductos", pantallas: ["productos"] },
  { pregunta: "¿Qué margen me deja la Libreta Kuromi y cuántas he vendido?", tema: "Catálogo", herramienta: "detalleProducto", pantallas: ["productos"] },
  { pregunta: "¿Qué entradas y salidas tuvo la Libreta Kuromi este mes?", tema: "Inventario", herramienta: "kardexProducto", pantallas: ["inventario", "movimientos-inventario"] },
  { pregunta: "¿Qué tengo que reponer esta semana?", tema: "Inventario", herramienta: "porReponer", pantallas: ["inicio", "aprovisionamiento", "proveedores", "inventario"], general: true },
  { pregunta: "¿Qué se agota en menos de una semana?", tema: "Inventario", herramienta: "riesgoInventario", pantallas: ["productos", "agotados", "stock-bajo", "inventario"] },
  {
    pregunta: "¿Cuánto vendí y cuánto compré con factura este mes, para la declaración?",
    tema: "Impuestos",
    herramienta: "reporteTributario",
    pantallas: ["reportes-tributarios"],
  },
  { pregunta: "¿Hay alertas en Mercado Libre?", tema: "Mercado Libre", herramienta: "saludMercadoLibre", pantallas: ["mercadolibre", "publicaciones"] },
  { pregunta: "¿Qué producto me conviene promocionar este mes?", tema: "Promoción y redes", herramienta: "productosParaPromocionar", pantallas: ["promociones", "ofertas", "cupones"], general: true },
  { pregunta: "Dame 3 ideas de Reel para esta semana", tema: "Promoción y redes", herramienta: "cargarHabilidad", pantallas: ["promociones", "boletin", "contenido"], general: true },
  { pregunta: "Escríbeme la descripción para la tienda del Set de washi tape pastel", tema: "Textos y kits", herramienta: "productoParaDescripcion", pantallas: ["productos"], general: true },
  {
    pregunta: "¿Qué productos llevan más de 90 días sin venderse y qué kits podría armar con ellos?",
    tema: "Textos y kits",
    herramienta: "kitsParaRotar",
    pantallas: ["productos", "inventario", "agotados"],
  },
  { pregunta: "Me costó $4.500, ¿a cuánto lo vendo en la tienda?", tema: "Precios", herramienta: "calcularPrecio", pantallas: ["configuracion", "categorias"] },
  {
    pregunta: "Me llegó un producto a $150 la unidad y tengo 150. ¿Me conviene en packs de 10, 20 o 30? El de 10 lo pensaba a $8.000",
    tema: "Precios",
    herramienta: "compararPacks",
    pantallas: ["configuracion", "categorias"],
  },
  { pregunta: "¿Qué productos quedan por debajo del 35 % y del 40 % de margen?", tema: "Precios", herramienta: "margenesBajoMinimo", pantallas: ["configuracion", "categorias"] },
  { pregunta: "¿A cuánto tendría que venderlo en Mercado Libre si me costó $6.000?", tema: "Precios", herramienta: "calcularPrecio", pantallas: ["configuracion"] },
];

const MAX_SUGGESTIONS = 5;

/** Las sugerencias de la pantalla desde la que se abrió (`?desde=`), o las generales. */
export function copilotSuggestions(screen: string | null | undefined): string[] {
  const segment = screen?.split(/[/?#]/)[0] ?? "";
  const forScreen = segment ? COPILOT_EXAMPLES.filter((example) => example.pantallas.includes(segment)) : [];
  const chosen = forScreen.length > 0 ? forScreen : COPILOT_EXAMPLES.filter((example) => example.general);
  return chosen.slice(0, MAX_SUGGESTIONS).map((example) => example.pregunta);
}
