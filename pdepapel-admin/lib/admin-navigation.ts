import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  History,
  Home,
  Images,
  Landmark,
  LayoutGrid,
  Mail,
  Package,
  PartyPopper,
  Percent,
  Plus,
  ScanLine,
  Settings,
  Shapes,
  ShoppingBag,
  Store,
  Tag,
  Truck,
  Users,
  Warehouse,
} from "lucide-react";

/**
 * Navegación del panel según el mapa de rutas del rediseño (2026-09).
 *
 * Cada destino de la barra lateral agrupa las rutas hermanas que todavía
 * existen como páginas separadas (por ejemplo, Atributos reúne tipos,
 * categorías, tamaños, colores y diseños). Cuando esas rutas se unifiquen en
 * pestañas, basta con retirar los `children` sin tocar la barra.
 */

export type NavBadgeKey = "pendingOrders" | "lowStock" | "marketplacePending";

export interface NavChild {
  label: string;
  segment: string;
}

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Segmento tras `/[storeId]/`. Vacío = inicio. */
  segment: string;
  exact?: boolean;
  badge?: NavBadgeKey;
  children?: NavChild[];
}

export interface NavGroup {
  id: string;
  label?: string;
  /** Tinte pastel del grupo (clase Tailwind). */
  tint?: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "main",
    items: [{ id: "inicio", label: "Inicio", icon: Home, segment: "", exact: true }],
  },
  {
    id: "ventas",
    label: "Ventas",
    tint: "bg-tint-pink",
    items: [
      {
        id: "pedidos",
        label: "Pedidos",
        icon: ShoppingBag,
        segment: "pedidos",
        badge: "pendingOrders",
        children: [
          { label: "Todos los pedidos", segment: "pedidos" },
          { label: "Plantillas de cotización", segment: "cotizaciones" },
        ],
      },
      {
        id: "pos",
        label: "Punto de venta",
        icon: ScanLine,
        segment: "ventas-rapidas",
        children: [
          { label: "Vender", segment: "ventas-rapidas" },
          { label: "Etiquetas", segment: "ventas-rapidas?tab=etiquetas" },
        ],
      },
      {
        id: "ferias",
        label: "Ferias",
        icon: PartyPopper,
        segment: "ferias",
        children: [
          { label: "Activas", segment: "ferias" },
          { label: "Cerradas", segment: "ferias?vista=cerradas" },
        ],
      },
      {
        id: "mercadolibre",
        label: "Mercado Libre",
        icon: Store,
        segment: "mercadolibre",
        badge: "marketplacePending",
        children: [
          { label: "Resumen", segment: "mercadolibre" },
          { label: "Publicaciones", segment: "mercadolibre?tab=publicaciones" },
          { label: "Ventas", segment: "mercadolibre?tab=ventas" },
          { label: "Preguntas y reclamos", segment: "mercadolibre?tab=preguntas" },
          { label: "Envíos", segment: "mercadolibre?tab=envios" },
          { label: "Anuncios y videos", segment: "mercadolibre?tab=anuncios" },
        ],
      },
      {
        id: "envios",
        label: "Envíos",
        icon: Truck,
        segment: "envios",
        children: [
          { label: "Por despachar", segment: "envios" },
          { label: "Despachados hoy", segment: "envios?vista=despachados-hoy" },
          { label: "En camino", segment: "envios?vista=en-camino" },
          { label: "Con novedad", segment: "envios?vista=con-novedad" },
          { label: "Entregados", segment: "envios?vista=entregados" },
        ],
      },
      {
        id: "clientes",
        label: "Clientes",
        icon: Users,
        segment: "clientes",
        children: [
          { label: "Clientes", segment: "clientes" },
          { label: "Reseñas", segment: "clientes?tab=resenas" },
        ],
      },
    ],
  },
  {
    id: "catalogo",
    label: "Catálogo",
    tint: "bg-tint-lavender",
    items: [
      {
        id: "productos",
        label: "Productos",
        icon: Tag,
        segment: "productos",
        children: [
          { label: "Listado", segment: "productos" },
          { label: "Gestión masiva", segment: "productos/gestion-masiva" },
          { label: "Nombres para búsqueda", segment: "productos/nombres" },
          { label: "Opciones para clientes", segment: "productos/opciones" },
        ],
      },
      {
        id: "atributos",
        label: "Atributos",
        icon: Shapes,
        segment: "atributos",
        children: [
          { label: "Categorías", segment: "atributos" },
          { label: "Subcategorías", segment: "atributos?tab=subcategorias" },
          { label: "Tamaños", segment: "atributos?tab=tamanos" },
          { label: "Colores", segment: "atributos?tab=colores" },
          { label: "Diseños", segment: "atributos?tab=disenos" },
          { label: "Opciones para clientes", segment: "atributos?tab=opciones" },
        ],
      },
      { id: "proveedores", label: "Proveedores", icon: ClipboardList, segment: "proveedores" },
      {
        id: "contenido",
        label: "Contenido de la tienda",
        icon: Images,
        segment: "contenido",
        children: [
          { label: "Portada", segment: "contenido" },
          { label: "Banners", segment: "contenido?tab=banners" },
          { label: "Redes en la tienda", segment: "contenido?tab=redes" },
        ],
      },
    ],
  },
  {
    id: "inventario",
    label: "Inventario",
    tint: "bg-tint-mint",
    items: [
      {
        id: "inventario",
        label: "Inventario",
        icon: Warehouse,
        segment: "inventario",
        badge: "lowStock",
        children: [
          { label: "Todo el stock", segment: "inventario" },
          { label: "Stock crítico", segment: "inventario?vista=stock-critico" },
          { label: "Agotados", segment: "inventario?vista=agotados" },
          { label: "Sin costo", segment: "inventario?vista=sin-costo" },
        ],
      },
      { id: "movimientos", label: "Movimientos", icon: History, segment: "movimientos-inventario" },
      { id: "aprovisionamiento", label: "Aprovisionamiento", icon: Package, segment: "aprovisionamiento" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    tint: "bg-tint-cream",
    items: [
      {
        id: "promociones",
        label: "Promociones",
        icon: Percent,
        segment: "promociones",
        children: [
          { label: "Ofertas", segment: "promociones" },
          { label: "Cupones", segment: "promociones?tab=cupones" },
        ],
      },
      { id: "boletin", label: "Boletín", icon: Mail, segment: "boletin" },
    ],
  },
  {
    id: "reportes",
    label: "Reportes",
    tint: "bg-tint-sky",
    items: [
      {
        id: "rendimiento",
        label: "Rendimiento",
        icon: BarChart3,
        segment: "rendimiento",
        children: [
          { label: "Resumen y caja", segment: "rendimiento" },
          { label: "Productos y riesgos", segment: "rendimiento?tab=detalle" },
          { label: "Envíos", segment: "rendimiento?tab=envios" },
        ],
      },
      { id: "tributarios", label: "Tributarios", icon: Landmark, segment: "reportes-tributarios" },
    ],
  },
];

export const FOOTER_ITEMS: NavItem[] = [
  {
    id: "manual",
    label: "Manual del panel",
    icon: BookOpen,
    // Ruta absoluta (fuera de /[storeId]): guía ilustrada, solo con sesión.
    segment: "/manual",
    exact: true,
  },
  {
    id: "ajustes",
    label: "Ajustes",
    icon: Settings,
    segment: "configuracion",
    children: [
      { label: "Tienda", segment: "configuracion" },
      { label: "Envíos y empaques", segment: "configuracion?tab=envios" },
      { label: "Pagos", segment: "configuracion?tab=pagos" },
      { label: "Integraciones", segment: "configuracion?tab=integraciones" },
      { label: "Avanzado", segment: "configuracion?tab=avanzado" },
    ],
  },
];

/** Barra inferior del teléfono. `more` abre el panel completo. */
export const MOBILE_NAV: { id: string; label: string; icon: LucideIcon; segment?: string; exact?: boolean; more?: boolean }[] = [
  { id: "inicio", label: "Inicio", icon: Home, segment: "", exact: true },
  { id: "pedidos", label: "Pedidos", icon: ShoppingBag, segment: "pedidos" },
  { id: "vender", label: "Vender", icon: ScanLine, segment: "ventas-rapidas" },
  { id: "inventario", label: "Inventario", icon: Warehouse, segment: "inventario" },
  { id: "mas", label: "Más", icon: LayoutGrid, more: true },
];

export interface QuickAction {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  segment: string;
  keywords: string[];
}

/** Acciones de la barra de comando: lo que la administradora quiere hacer. */
export const QUICK_ACTIONS: QuickAction[] = [
  { id: "nuevo-pedido", label: "Nuevo pedido", hint: "Crear un pedido manual o una cotización", icon: Plus, segment: "pedidos/nuevo", keywords: ["crear pedido", "orden", "cotización", "cotizacion"] },
  { id: "vender", label: "Registrar venta presencial", hint: "Punto de venta con lector", icon: ScanLine, segment: "ventas-rapidas", keywords: ["vender", "mostrador", "datáfono", "datafono", "punto de venta", "efectivo"] },
  { id: "verificar-pago", label: "Verificar pagos por transferencia", hint: "Pedidos pendientes de pago", icon: ShoppingBag, segment: "pedidos?vista=por-verificar", keywords: ["verificar", "transferencia", "pago", "nequi", "bancolombia", "comprobante"] },
  { id: "crear-guia", label: "Crear guías de envío", hint: "Pedidos pagados sin guía", icon: Truck, segment: "pedidos?vista=por-despachar", keywords: ["guía", "guia", "envío", "envio", "etiqueta", "coordinadora"] },
  { id: "nuevo-producto", label: "Nuevo producto", icon: Tag, segment: "productos/nuevo", keywords: ["crear producto", "agregar producto"] },
  { id: "ajustar-inventario", label: "Ajustar inventario", hint: "Daños, conteos, usos internos", icon: History, segment: "movimientos-inventario", keywords: ["stock", "ajuste", "conteo", "daño", "inventario"] },
  { id: "reponer", label: "Reponer stock", hint: "Nueva orden de aprovisionamiento", icon: Package, segment: "aprovisionamiento/nuevo", keywords: ["reponer", "aprovisionar", "proveedor", "comprar"] },
  { id: "preguntas-ml", label: "Responder preguntas de Mercado Libre", icon: Store, segment: "mercadolibre?tab=preguntas", keywords: ["pregunta", "mercado libre", "reclamo"] },
  { id: "manual", label: "Abrir el manual del panel", hint: "Guía paso a paso con capturas de cada pantalla", icon: BookOpen, segment: "/manual", keywords: ["manual", "ayuda", "guía", "guia", "cómo", "como", "instrucciones", "tutorial"] },
];

const SEGMENT_LABELS: Record<string, string> = {
  manual: "Manual del panel",
  pedidos: "Pedidos",
  cotizaciones: "Plantillas de cotización",
  "ventas-rapidas": "Punto de venta",
  ferias: "Ferias",
  mercadolibre: "Mercado Libre",
  envios: "Envíos",
  clientes: "Clientes",
  resenas: "Reseñas",
  productos: "Productos",
  "gestion-masiva": "Gestión masiva",
  nombres: "Nombres para búsqueda",
  opciones: "Opciones para clientes",
  grupo: "Grupo de variantes",
  "nuevo-grupo": "Nuevo grupo",
  "product-groups": "Grupos de variantes",
  atributos: "Atributos",
  tipos: "Categorías",
  categorias: "Subcategorías",
  tamanos: "Tamaños",
  colores: "Colores",
  disenos: "Diseños",
  proveedores: "Proveedores",
  contenido: "Contenido de la tienda",
  diapositivas: "Portada",
  banners: "Banners",
  principal: "Banner principal",
  publicaciones: "Redes en la tienda",
  inventario: "Inventario",
  "stock-bajo": "Stock bajo",
  agotados: "Agotados",
  "movimientos-inventario": "Movimientos",
  aprovisionamiento: "Aprovisionamiento",
  promociones: "Promociones",
  ofertas: "Ofertas",
  cupones: "Cupones",
  boletin: "Boletín",
  rendimiento: "Rendimiento",
  negocio: "Negocio y crecimiento",
  "inteligencia-negocio": "Rendimiento detallado",
  "reportes-tributarios": "Tributarios",
  configuracion: "Ajustes",
  cajas: "Cajas y empaques",
  cloudinary: "Imágenes",
  nuevo: "Nuevo",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Etiqueta en español para un segmento de URL; los ids se leen como “Detalle”. */
export function segmentLabel(segment: string): string {
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
  // Ids: UUID, ids largos (Clerk, cuid) y teléfonos normalizados (página de cliente).
  if (UUID.test(segment) || /^[0-9a-z]{20,}$/i.test(segment) || /^\d{7,}$/.test(segment)) return "Detalle";
  return segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");
}

/** Grupo de la barra lateral al que pertenece un segmento (para la miga de pan). */
export function groupForSegment(segment: string): NavGroup | undefined {
  return NAV_GROUPS.find((group) =>
    group.items.some(
      (item) =>
        item.segment === segment ||
        item.children?.some((child) => child.segment === segment),
    ),
  );
}

export function dashboardHref(storeId: string, segment: string): string {
  // Un segmento que empieza por "/" es una ruta absoluta del panel (p. ej. /manual).
  if (segment.startsWith("/")) return segment;
  return segment ? `/${storeId}/${segment}` : `/${storeId}`;
}

/**
 * Un segmento puede llevar consulta (`atributos?tab=colores`): la ruta se compara
 * sin ella y la consulta se compara con la búsqueda actual cuando se pasa.
 */
export function isSegmentActive(
  pathname: string,
  storeId: string,
  segment: string,
  exact = false,
  search?: string,
): boolean {
  const [path, query = ""] = segment.split("?");
  const href = dashboardHref(storeId, path);
  const pathMatches = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  if (!pathMatches) return false;
  if (search === undefined) return true;
  const current = search.replace(/^\?/, "");
  return query ? current === query : current === "";
}
