import type { ShipmentMilestone } from "@/lib/shipment-milestones";

/**
 * Las variables de las cinco plantillas de utilidad de avisos (ver
 * docs/whatsapp-plantillas-avisos.md). El orden aquí es el orden de {{1}}, {{2}}…
 * en Meta: cambiar uno sin el otro manda datos cruzados.
 */
export const ORDER_TEMPLATE_LANGUAGE = "es_CO";

interface TemplateOrder {
  id: string;
  orderNumber: string;
  fullName: string;
  shipping: { trackingCode: string | null; carrierName: string | null; courier: string | null } | null;
}

const firstName = (fullName: string) => fullName.trim().split(/\s+/)[0] || "hola";

/** Lo que nombra cada variable en el aviso, para decir cuál faltó. */
const PARAM_LABELS: Record<string, string[]> = {
  guia_creada: ["{{1}} nombre", "{{2}} número de pedido", "{{3}} transportadora", "{{4}} número de guía"],
};
const DEFAULT_PARAM_LABELS = ["{{1}} nombre", "{{2}} número de pedido"];

/** Las variables vacías, por su nombre; vacío = se puede mandar. */
export function missingTemplateParams(milestone: ShipmentMilestone, bodyParams: string[]): string[] {
  const labels = PARAM_LABELS[milestone] ?? DEFAULT_PARAM_LABELS;
  return bodyParams.flatMap((value, i) => (value.trim() ? [] : [labels[i] ?? `{{${i + 1}}}`]));
}

export function buildOrderUpdateTemplate(name: string, milestone: ShipmentMilestone, order: TemplateOrder) {
  const carrier = order.shipping?.carrierName || order.shipping?.courier || "la transportadora";
  const guide = order.shipping?.trackingCode ?? "";
  const bodyParams =
    milestone === "guia_creada" ? [firstName(order.fullName), order.orderNumber, carrier, guide] : [firstName(order.fullName), order.orderNumber];
  return { name, language: ORDER_TEMPLATE_LANGUAGE, bodyParams, buttonUrlSuffix: order.id };
}
