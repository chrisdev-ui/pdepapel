"use client";

import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { cn, currencyFormatter } from "@/lib/utils";
import { OrderStatus } from "@prisma/client";
import Link from "next/link";
import { useMemo } from "react";
import {
  formatPhoneNumber,
  isValidPhoneNumber,
} from "react-phone-number-input";

interface OrderData {
  orderNumber: string;
  status: OrderStatus;
  fullName: string;
  phone: string;
  totalPrice?: number | string;
  products?: Array<{ name: string; quantity: number; sku?: string }>;
  token?: string | null;
  trackingCode?: string | null;
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
  size?: "sm" | "md" | "lg" | "default" | "icon";
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  compact?: boolean;
  order?: OrderData;
  customer?: CustomerData;
  storeUrl?: string;
}

export const WhatsappButton: React.FC<WhatsappButtonProps> = ({
  className,
  withText = false,
  size = "sm",
  variant = "link",
  compact = false,
  order,
  customer,
  storeUrl = process.env.NEXT_PUBLIC_FRONTEND_STORE_URL ||
    process.env.FRONTEND_STORE_URL ||
    "http://localhost:3001",
}) => {
  const data = order || customer;

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
    const TRUCK = "\u{1F69A}";

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
        case "QUOTATION": // Handle as string literal if OrderStatus.QUOTATION not strictly available in enum during dev, or import it. It is imported.
          const quoteUrl = `${storeUrl}/quote/${order.token}`;
          message =
            `${baseMessage}Aquí tienes la cotización que solicitaste en P de Papel 👇\n\n` +
            `📄 *Ver Cotización:* ${quoteUrl}\n\n` +
            `Tu pedido incluye:\n${productsList}\n\n` +
            `Total: ${orderPrice}\n\n` +
            `Si tienes alguna duda o quieres confirmar, ¡avísame por aquí! ${SMILE}`;
          break;

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

        case "SENT":
        case OrderStatus.SENT:
          const trackingMsg = order.trackingCode
            ? `\n🚚 Guía: ${order.trackingCode}`
            : "";
          message =
            `${baseMessage}¡Tu pedido va en camino! ${TRUCK}\n\n` +
            `Orden #${order.orderNumber} enviada.${trackingMsg}\n\n` +
            `¡Espero que lo disfrutes mucho! ${SMILE}`;
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
            `Lamentamos informarte que tu orden fue cancelada. Esto puede suceder cuando hay problemas al procesar el pago.\n\n` +
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
  }, [data, order, customer, firstName, orderPrice, storeUrl]);

  const whatsappUrl = useMemo(
    () => `whatsapp://send?phone=${data?.phone}&text=${getMessage}`,
    [data?.phone, getMessage],
  );

  // Early return after all hooks have been called
  if (!data || !data.phone || !isValidPhoneNumber(data.phone)) return null;

  // Resolve size 'md' to 'default' for Button component compatibility
  const buttonSize = size === "md" ? "default" : size;

  if (compact) {
    return (
      <Button
        variant={variant}
        size={buttonSize === "sm" ? "icon" : buttonSize}
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
    <Button
      variant={variant}
      size={buttonSize}
      className={cn("px-1", className)}
      asChild
    >
      <Link href={whatsappUrl} target="_blank">
        <Icons.whatsapp
          className={cn("text-[#25D366]", {
            "h-5 w-5": size === "sm",
            "h-6 w-6": size === "md",
            "h-7 w-7": size === "lg",
            "text-white": variant === "default", // Make icon white if button is solid
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
