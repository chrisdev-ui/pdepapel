/** Sugerencias según la pantalla desde la que se abrió el copiloto (`?desde=`). */
const BY_SCREEN: Record<string, string[]> = {
  inicio: ["¿Cómo voy hoy?", "¿Cómo me fue este mes frente al anterior?", "¿Qué tengo que reponer esta semana?"],
  productos: ["¿Qué productos están por debajo del costo?", "¿Qué se agota en menos de una semana?", "Busca las libretas con stock"],
  "por-reponer": ["¿Qué debería pedirle primero al proveedor?", "¿Qué se agota en menos de una semana?"],
  pedidos: ["¿Cuántos pedidos tengo pendientes?", "¿Cuánto vendí en el punto de venta ayer?"],
  mercadolibre: ["¿Hay alertas en Mercado Libre?", "¿Cómo está la conexión con Mercado Libre?"],
};

const GENERAL = [
  "¿Cómo voy hoy?",
  "¿Qué marcador sirve para pintar sobre tela?",
  "¿Cuál fue mi margen del mes pasado?",
  "¿Qué tengo que reponer esta semana?",
];

export function suggestionsFor(screen: string | null | undefined): string[] {
  if (!screen) return GENERAL;
  const key = Object.keys(BY_SCREEN).find((candidate) => screen.includes(candidate));
  return key ? BY_SCREEN[key] : GENERAL;
}

/** Lo que se ve mientras corre cada herramienta. */
export const TOOL_LABELS: Record<string, string> = {
  resumenDeHoy: "Consultando el resumen de hoy",
  resumenFinancieroMes: "Consultando las finanzas del mes",
  compararMeses: "Comparando los dos meses",
  ventasDelDiaPuntoDeVenta: "Consultando las ventas presenciales",
  buscarProductos: "Buscando en el catálogo",
  detalleProducto: "Mirando el producto",
  kardexProducto: "Revisando los movimientos del producto",
  porReponer: "Calculando qué reponer",
  riesgoInventario: "Revisando el inventario en riesgo",
  reporteTributario: "Sumando ventas y compras del periodo",
  saludMercadoLibre: "Revisando Mercado Libre",
};
