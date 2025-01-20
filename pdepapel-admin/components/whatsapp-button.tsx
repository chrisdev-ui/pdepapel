"use client";

import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { cn, currencyFormatter, formatPhoneNumber } from "@/lib/utils";
import { OrderStatus } from "@prisma/client";
import Link from "next/link";
import { useMemo } from "react";

interface WhatsappButtonProps {
  withText?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
  order: {
    orderNumber: string;
    status: OrderStatus;
    fullName: string;
    phone: string;
    totalPrice?: number | string;
    products?: Array<{ name: string; quantity: number }>;
  };
}

export const WhatsappButton: React.FC<WhatsappButtonProps> = ({
  className,
  withText = false,
  size = "sm",
  order,
}) => {
  const formattedPhone = useMemo(
    () => `57${order.phone.replace(/\D/g, "")}`,
    [order.phone],
  );

  const firstName = useMemo(() => {
    return order.fullName.split(" ")[0];
  }, [order.fullName]);

  const orderPrice = useMemo(() => {
    return typeof order.totalPrice === "number"
      ? currencyFormatter.format(order.totalPrice || 0)
      : order.totalPrice || "";
  }, [order.totalPrice]);

  const getMessage = useMemo(() => {
    const productsList = order.products
      ?.map((p) => `- ${p.name} (${p.quantity} unidad/es)`)
      .join("\n");

    const WAVE = "\u{1F44B}";
    const SHOPPING_BAGS = "\u{1F6CD}";
    const CAMERA = "\u{1F4F8}";
    const PARTY = "\u{1F389}";
    const PACKAGE = "\u{1F4E6}";
    const SMILE = "\u{1F60A}";

    const baseMessage = `¡Hola ${firstName}! ${WAVE}\n\n`;

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
  }, [order, firstName, orderPrice]);

  const whatsappUrl = `whatsapp://send?phone=${formattedPhone}&text=${getMessage}`;
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
          <span className="ml-2 text-sm">{formatPhoneNumber(order.phone)}</span>
        )}
      </Link>
    </Button>
  );
};
