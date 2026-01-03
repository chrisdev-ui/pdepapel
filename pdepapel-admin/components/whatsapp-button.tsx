"use client";

import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { cn, currencyFormatter, formatPhoneNumber } from "@/lib/utils";
import { OrderStatus } from "@prisma/client";
import Link from "next/link";
import { useMemo } from "react";

interface OrderData {
  orderNumber: string;
  status: OrderStatus;
  fullName: string;
  phone: string;
  totalPrice?: number | string;
  products?: Array<{ name: string; quantity: number; sku?: string }>;
}

interface CustomerData {
  fullName: string;
  phone: string;
  totalOrders: number;
  totalSpent: number;
  recentOrders: Array<{
    orderNumber: string;
    status: string;
    total: number;
    createdAt: Date;
  }>;
}

interface WhatsappButtonProps {
  withText?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
  compact?: boolean;
  order?: OrderData;
  customer?: CustomerData;
}

export const WhatsappButton: React.FC<WhatsappButtonProps> = ({
  className,
  withText = false,
  size = "sm",
  compact = false,
  order,
  customer,
}) => {
  const data = order || customer;

  // Always call useMemo hooks unconditionally
  const formattedPhone = useMemo(() => {
    if (!data?.phone) return "";
    // If it's already +57... just strip +, otherwise ensure 57 prefix if missing?
    // Safer to use parsePhoneNumber to get the digits if possible, or just strip non-digits.
    // If input is +57 300..., replace(\D) -> 57300...
    // If input is 300..., replace(\D) -> 300... -> prepend 57 -> 57300...
    // This assumes Colombian numbers if no country code?
    // Let's rely on standard logic:
    const cleaned = data.phone.replace(/\D/g, "");
    if (cleaned.startsWith("57")) return cleaned;
    return `57${cleaned}`;
  }, [data]);

  const firstName = useMemo(() => {
    return data ? data.fullName.split(" ")[0] : "";
  }, [data]);

  const orderPrice = useMemo(() => {
    if (order?.totalPrice) {
      return typeof order.totalPrice === "number"
        ? currencyFormatter(order.totalPrice)
        : order.totalPrice;
    }
    return "";
  }, [order?.totalPrice]);

  const getMessage = useMemo(() => {
    if (!data) return "";

    const WAVE = "\u{1F44B}";
    const SHOPPING_BAGS = "\u{1F6CD}";
    const CAMERA = "\u{1F4F8}";
    const PARTY = "\u{1F389}";
    const PACKAGE = "\u{1F4E6}";
    const SMILE = "\u{1F60A}";
    const USER = "\u{1F464}";
    const CHART = "\u{1F4CA}";

    const baseMessage = `¡Hola ${firstName}! ${WAVE}\n\n`;

    // If it's customer data, generate customer-specific message
    if (customer) {
      const recentOrdersList = customer.recentOrders
        .slice(0, 3)
        .map(
          (order) =>
            `- #${order.orderNumber} - ${currencyFormatter(order.total)} (${order.status})`,
        )
        .join("\n");

      return encodeURIComponent(
        `${baseMessage}Te contacto desde P de Papel ${USER}\n\n` +
          `${CHART} *Tu historial como cliente:*\n` +
          `📦 Total de órdenes: ${customer.totalOrders}\n` +
          `💰 Total gastado: ${currencyFormatter(customer.totalSpent)}\n\n` +
          `📋 *Tus órdenes recientes:*\n${recentOrdersList}\n\n` +
          `¿En qué puedo ayudarte hoy? ${SMILE}`,
      );
    }

    // If it's order data, use the existing order-specific logic
    if (order) {
      const productsList = order.products
        ?.map(
          (p) =>
            `- ${p.name}${p.sku ? ` (${p.sku})` : ""} (${p.quantity} unidad/es)`,
        )
        .join("\n");

      let message: string;
      switch (order.status) {
        case OrderStatus.PENDING:
          message =
            `${baseMessage}Te escribo respecto a tu orden #${order.orderNumber} en P de Papel.\n\n` +
            `Tu pedido incluye:\n${productsList}\n\n` +
            `Total a pagar: ${orderPrice}\n\n` +
            `¿Te puedo ayudar a finalizar tu compra? ${SHOPPING_BAGS}`;
          break;

        case OrderStatus.CREATED:
          message =
            `${baseMessage}Te escribo respecto a tu orden #${order.orderNumber} en P de Papel.\n\n` +
            `Estamos esperando la confirmación de tu pago para proceder con el envío de:\n${productsList}\n\n` +
            `Total: ${orderPrice}\n\n` +
            `¿Ya realizaste el pago? Puedes enviarnos el comprobante por este medio ${CAMERA}`;
          break;

        case OrderStatus.PAID:
          message =
            `${baseMessage}¡Gracias por tu compra en P de Papel! ${PARTY}\n\n` +
            `Tu orden #${order.orderNumber} está confirmada y pronto será despachada.\n\n` +
            `Productos:\n${productsList}\n\n` +
            `Te mantendremos informado sobre el estado de tu envío ${PACKAGE}`;
          break;

        case OrderStatus.CANCELLED:
          message =
            `${baseMessage}Te escribo respecto a tu orden #${order.orderNumber} en P de Papel.\n\n` +
            `Lamentamos informarte que tu orden fue cancelada. Esto puede suceder cuando hay problemas con el procesamiento del pago en línea.\n\n` +
            `¿Te gustaría intentar nuevamente tu compra? Podemos ayudarte a procesar tu orden con un método de pago alternativo ${SHOPPING_BAGS}\n\n` +
            `¡Estamos aquí para ayudarte! ${SMILE}`;
          break;

        default:
          message =
            `${baseMessage}Te escribo respecto a tu orden #${order.orderNumber} en P de Papel.\n\n` +
            `¿En qué te puedo ayudar? ${SMILE}`;
          break;
      }
      return encodeURIComponent(message);
    }

    return encodeURIComponent(
      `${baseMessage}¿En qué te puedo ayudar? ${SMILE}`,
    );
  }, [data, order, customer, firstName, orderPrice]);

  const whatsappUrl = useMemo(
    () => `whatsapp://send?phone=${formattedPhone}&text=${getMessage}`,
    [formattedPhone, getMessage],
  );

  // Early return after all hooks have been called
  if (!data) return null;

  if (compact) {
    return (
      <Button
        variant="link"
        className={cn("h-8 w-8 px-1", className)}
        asChild
        title={`Contactar a ${firstName} por WhatsApp`}
      >
        <Link href={whatsappUrl} target="_blank">
          <Icons.whatsapp className="h-4 w-4 text-[#25D366]" />
          <span className="sr-only">Abrir WhatsApp Web</span>
        </Link>
      </Button>
    );
  }

  return (
    <Button variant="link" className={cn("px-1", className)} asChild>
      <Link href={whatsappUrl} target="_blank">
        <Icons.whatsapp
          className={cn("text-[#25D366]", {
            "h-5 w-5": size === "sm",
            "h-6 w-6": size === "md",
            "h-7 w-7": size === "lg",
          })}
        />
        <span className="sr-only">Abrir WhatsApp Web</span>
        {withText && (
          <span className="ml-2 text-sm">{formatPhoneNumber(data.phone)}</span>
        )}
      </Link>
    </Button>
  );
};
