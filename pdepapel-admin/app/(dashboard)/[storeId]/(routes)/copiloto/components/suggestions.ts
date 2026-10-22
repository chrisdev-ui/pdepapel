import { copilotSuggestions } from "@/lib/copiloto/examples";

/** Sugerencias según la pantalla desde la que se abrió el copiloto (`?desde=`): los ejemplos del manual. */
export const suggestionsFor = copilotSuggestions;

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
  productosParaPromocionar: "Buscando qué promocionar",
  cargarHabilidad: "Preparando la habilidad",
  productoParaDescripcion: "Leyendo la ficha del producto",
  kitsParaRotar: "Buscando productos quietos para kits",
  textosDeKits: "Escribiendo los textos de los kits",
  calcularPrecio: "Calculando el precio",
  compararPacks: "Comparando los packs",
  margenesBajoMinimo: "Revisando los márgenes",
  precioDeKit: "Calculando el precio del kit",
};
