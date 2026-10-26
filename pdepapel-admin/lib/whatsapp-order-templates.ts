import type { ShipmentMilestone } from "@/lib/shipment-milestones";

/**
 * Las variables de las dos plantillas de utilidad de avisos (ver
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

export function buildOrderUpdateTemplate(name: string, milestone: ShipmentMilestone, order: TemplateOrder) {
  const carrier = order.shipping?.carrierName || order.shipping?.courier || "la transportadora";
  const guide = order.shipping?.trackingCode ?? "";
  const bodyParams =
    milestone === "guia_creada" ? [firstName(order.fullName), order.orderNumber, carrier, guide] : [firstName(order.fullName), order.orderNumber];
  return { name, language: ORDER_TEMPLATE_LANGUAGE, bodyParams, buttonUrlSuffix: order.id };
}
