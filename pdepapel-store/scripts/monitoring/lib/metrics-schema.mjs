/**
 * Stable metric keys for history.json. Never rename a key: add a new one and
 * leave the old one empty, so the 4-week trends keep reading the same series.
 * `better`: which direction is good ("up", "down" or null when neutral).
 */
const m = (key, label, unit, better) => ({ key, label, unit, better });

export const SOURCES = {
  ga4: "Google Analytics 4",
  clarity: "Microsoft Clarity",
  gsc: "Google Search Console",
  merchant: "Google Merchant Center",
  tiktok: "TikTok Events Manager",
  vercel: "Vercel",
  psi: "PageSpeed Insights",
  admin: "Panel (solo lectura)",
  ventas: "Ventas por canal (base de datos)",
  capa2: "Chequeo diario (capa 2)",
};

/** Sources the weekly review must not write: scripts produce them. */
export const SCRIPT_SOURCES = new Set(["capa2", "ventas"]);

const VENTAS_CHANNELS = [
  ["whatsapp", "WhatsApp"],
  ["instagram", "Instagram"],
  ["tiktok", "TikTok"],
  ["presencial", "Presencial"],
  ["feria", "Feria"],
  ["otro", "Otro"],
  ["tienda", "Tienda en línea"],
  ["sin_registrar", "Sin registrar"],
];

export const METRICS = [
  m("ga4.users", "Usuarios", "n", "up"),
  m("ga4.sessions", "Sesiones", "n", "up"),
  m("ga4.engagement_rate", "Tasa de interacción", "%", "up"),
  m("ga4.unassigned_sessions_pct", "Sesiones «Unassigned»", "%", "down"),
  m("ga4.funnel.view_item", "Embudo · view_item (usuarios)", "n", "up"),
  m("ga4.funnel.select_item_variant", "Embudo · select_item_variant", "n", "up"),
  m("ga4.funnel.add_to_cart", "Embudo · add_to_cart", "n", "up"),
  m("ga4.funnel.view_cart", "Embudo · view_cart", "n", "up"),
  m("ga4.funnel.begin_checkout", "Embudo · begin_checkout", "n", "up"),
  m("ga4.funnel.add_shipping_info", "Embudo · add_shipping_info", "n", "up"),
  m("ga4.funnel.add_payment_info", "Embudo · add_payment_info", "n", "up"),
  m("ga4.funnel.purchase", "Embudo · purchase", "n", "up"),
  m("ga4.purchases", "Compras (eventos)", "n", "up"),
  m("ga4.revenue_cop", "Ingresos", "cop", "up"),
  m("ga4.aov_cop", "Ticket promedio", "cop", "up"),
  m("ga4.event.checkout_validation_error", "checkout_validation_error", "n", "down"),
  m("ga4.event.city_not_found", "city_not_found", "n", "down"),
  m("ga4.event.catalog_no_results", "catalog_no_results", "n", "down"),
  m("ga4.event.cart_reminder_view", "cart_reminder_view", "n", null),
  m("ga4.mobile_users_pct", "Usuarios en móvil", "%", null),
  m("clarity.sessions", "Sesiones", "n", "up"),
  m("clarity.dead_clicks_pct", "Clics muertos", "%", "down"),
  m("clarity.rage_clicks_pct", "Clics de rabia", "%", "down"),
  m("clarity.quick_backs_pct", "Regresos rápidos", "%", "down"),
  m("clarity.excessive_scrolling_pct", "Scroll excesivo", "%", "down"),
  m("clarity.js_errors_pct", "Sesiones con error JS", "%", "down"),
  m("clarity.lcp_ms", "LCP (p75)", "ms", "down"),
  m("clarity.inp_ms", "INP (p75)", "ms", "down"),
  m("clarity.cls", "CLS (p75)", "cls", "down"),
  m("gsc.clicks", "Clics", "n", "up"),
  m("gsc.impressions", "Impresiones", "n", "up"),
  m("gsc.ctr_pct", "CTR", "%", "up"),
  m("gsc.position", "Posición media", "pos", "down"),
  m("gsc.indexed_pages", "Páginas indexadas", "n", "up"),
  m("gsc.not_indexed_pages", "Páginas sin indexar", "n", "down"),
  m("merchant.disapproved", "Productos rechazados", "n", "down"),
  m("merchant.limited", "Productos limitados", "n", "down"),
  m("merchant.approved", "Productos aprobados", "n", "up"),
  m("tiktok.view_content", "ViewContent", "n", "up"),
  m("tiktok.add_to_cart", "AddToCart", "n", "up"),
  m("tiktok.initiate_checkout", "InitiateCheckout", "n", "up"),
  m("tiktok.add_payment_info", "AddPaymentInfo", "n", "up"),
  m("tiktok.complete_payment", "CompletePayment", "n", "up"),
  m("tiktok.search", "Search", "n", null),
  m("vercel.store_failed_deploys", "Despliegues fallidos · tienda", "n", "down"),
  m("vercel.admin_failed_deploys", "Despliegues fallidos · panel", "n", "down"),
  m("vercel.store_runtime_errors", "Errores en ejecución · tienda", "n", "down"),
  m("vercel.admin_runtime_errors", "Errores en ejecución · panel", "n", "down"),
  m("psi.home_mobile_score", "Inicio móvil · puntaje", "n", "up"),
  m("psi.home_mobile_lcp_ms", "Inicio móvil · LCP lab", "ms", "down"),
  m("psi.product_mobile_score", "Producto móvil · puntaje", "n", "up"),
  m("psi.product_mobile_lcp_ms", "Producto móvil · LCP lab", "ms", "down"),
  m("psi.origin_lcp_p75_ms", "Origen · LCP campo p75", "ms", "down"),
  m("psi.origin_inp_p75_ms", "Origen · INP campo p75", "ms", "down"),
  m("psi.origin_cls_p75", "Origen · CLS campo p75", "cls", "down"),
  m("admin.jobrun_failures", "Tareas programadas con falla", "n", "down"),
  m("admin.ml_active_listings", "Publicaciones ML activas", "n", "up"),
  m("admin.ml_problem_listings", "Publicaciones ML con problema", "n", "down"),
  m("admin.owner_alerts", "Alertas pendientes de la dueña", "n", "down"),
  m("ventas.orders", "Ventas (pedidos)", "n", "up"),
  m("ventas.total_cop", "Ventas (total)", "cop", "up"),
  ...VENTAS_CHANNELS.flatMap(([id, label]) => [
    m(`ventas.${id}.orders`, `${label} · pedidos`, "n", id === "sin_registrar" ? "down" : "up"),
    m(`ventas.${id}.cop`, `${label} · total`, "cop", id === "sin_registrar" ? null : "up"),
  ]),
  m("capa2.days_run", "Días con chequeo", "n", "up"),
  m("capa2.days_failed", "Días con falla", "n", "down"),
  m("capa2.home_390_lcp_ms_median", "Inicio 390 · LCP lab (mediana)", "ms", "down"),
];

export const METRIC_KEYS = new Set(METRICS.map((metric) => metric.key));

export function sourceOfKey(key) {
  return key.split(".")[0];
}
