/** Desplaza la vista hasta un ancla del formulario (`#pago`, `#envio`…). */
export function scrollToOrderSection(href: string): void {
  if (typeof document === "undefined" || !href.startsWith("#")) return;
  const target = document.getElementById(href.slice(1));
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}
