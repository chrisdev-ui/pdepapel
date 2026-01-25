import { CustomOrder, CustomOrderItem } from "@prisma/client";
import { currencyFormatter } from "./utils";

export const WhatsAppTemplates = {
  customOrder: (
    order: CustomOrder & { items: CustomOrderItem[] },
    publicUrl: string,
  ) => {
    const header = `📦 *Cotización: ${order.orderNumber}*`;
    const greeting = `Hola ${order.customerName}, es un gusto saludarte.`;
    const itemsList = order.items
      .map(
        (item) =>
          `• ${item.quantity}x ${item.name} (${currencyFormatter(Number(item.subtotal))})`,
      )
      .join("\n");

    const totals = [
      `Subtotal: ${currencyFormatter(Number(order.subtotal))}`,
      order.discount > 0
        ? `Descuento: -${currencyFormatter(Number(order.discount))}`
        : null,
      order.shippingCost > 0
        ? `Envío: +${currencyFormatter(Number(order.shippingCost))}`
        : null,
      `*Total: ${currencyFormatter(Number(order.total))}*`,
    ]
      .filter(Boolean)
      .join("\n");

    const link = `🔗 *Ver Detalle y Pagar aquí:* \n${publicUrl}`;

    const footer = `Cualquier duda quedamos atentos. ¡Gracias por tu preferencia!`;

    const message = [
      header,
      greeting,
      "",
      "*Resumen:*",
      itemsList,
      "",
      totals,
      "",
      link,
      "",
      footer,
    ].join("\n");

    return message;
  },
};

export const EmailTemplates = {
  customOrder: (
    order: CustomOrder & { items: CustomOrderItem[] },
    publicUrl: string,
  ) => {
    const subject = `Cotización ${order.orderNumber} - P de Papel`;

    const itemsList = order.items
      .map(
        (item) =>
          `- ${item.quantity}x ${item.name}: ${currencyFormatter(Number(item.subtotal))}`,
      )
      .join("\n");

    const totals = [
      `Subtotal: ${currencyFormatter(Number(order.subtotal))}`,
      order.discount > 0
        ? `Descuento: -${currencyFormatter(Number(order.discount))}`
        : null,
      order.shippingCost > 0
        ? `Envío: +${currencyFormatter(Number(order.shippingCost))}`
        : null,
      `Total: ${currencyFormatter(Number(order.total))}`,
    ]
      .filter(Boolean)
      .join("\n");

    const body = `Hola ${order.customerName},

Adjuntamos el resumen de tu cotización:

${itemsList}

${totals}

Puedes ver el detalle completo y realizar el pago en el siguiente enlace:
${publicUrl}

Quedamos atentos a cualquier duda.

Atentamente,
El equipo de P de Papel`;

    return { subject, body };
  },
};
