import type { INPMetricWithAttribution, LCPMetricWithAttribution } from "web-vitals/attribution";

export const WEB_VITALS_LCP_EVENT = "web_vitals_lcp";
export const WEB_VITALS_INP_EVENT = "web_vitals_inp";

/** GA4 corta los valores de parámetros de evento en 100 caracteres. */
export const GA4_PARAM_VALUE_LIMIT = 100;

const ms = (value: number | undefined) => Math.round(Number.isFinite(value) ? (value as number) : 0);
const clip = (value: string) => value.slice(0, GA4_PARAM_VALUE_LIMIT);

/** Una restauración desde la caché de ida y vuelta no es una carga: no se compara con el resto. */
export const isBackForwardRestore = (metric: { navigationType: string }) => metric.navigationType === "back-forward-cache";

function urlHost(url: string | undefined): string {
  if (!url) return "(sin recurso)";
  if (url.startsWith("data:")) return "data";
  try {
    return new URL(url, window.location.href).host || "(sin recurso)";
  } catch {
    return "(desconocido)";
  }
}

/**
 * LCP de la carga con sus cuatro tramos (los mismos de Lighthouse), qué tipo
 * de elemento fue y de qué host salió su recurso. Sin selectores ni URLs
 * completas: nada que pueda llevar datos de la persona.
 */
export function lcpEventParams(metric: LCPMetricWithAttribution, page: string) {
  const { attribution } = metric;
  return {
    lcp_value: ms(metric.value),
    lcp_ttfb: ms(attribution.timeToFirstByte),
    lcp_load_delay: ms(attribution.resourceLoadDelay),
    lcp_load_duration: ms(attribution.resourceLoadDuration),
    lcp_render_delay: ms(attribution.elementRenderDelay),
    lcp_element: clip(attribution.lcpEntry?.element?.tagName.toLowerCase() ?? "(desconocido)"),
    lcp_url_host: clip(urlHost(attribution.url)),
    lcp_rating: metric.rating,
    lcp_page: clip(page),
  };
}

/**
 * INP de toda la vida de la página: la interacción más lenta, su tipo y el
 * selector del elemento (etiquetas y clases, no contenido).
 */
export function inpEventParams(metric: INPMetricWithAttribution, page: string) {
  const { attribution } = metric;
  return {
    inp_value: ms(metric.value),
    inp_target: clip(attribution.interactionTarget || "(desconocido)"),
    inp_type: attribution.interactionType ?? "(desconocido)",
    inp_rating: metric.rating,
    inp_page: clip(page),
  };
}
