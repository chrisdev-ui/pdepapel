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

  const encodeEmoji = (str: string) => {
    return str
      .split("")
      .map((char) => {
        const code = char.codePointAt(0);
        return code && code > 127
          ? `%${code.toString(16).toUpperCase()}`
          : encodeURIComponent(char);
      })
      .join("");
  };

  const getMessage = useMemo(() => {
    const productsList = order.products
      ?.map((p) => `- ${p.name} (${p.quantity} unidad/es)`)
      .join("\n");

    const baseMessage = `¡Hola ${firstName}! 👋\n\n`;

    let message: string;
    switch (order.status) {
      case OrderStatus.PENDING:
        message =
          `${baseMessage}Te escribo respecto a tu orden #${order.orderNumber} en P de Papel.\n\n` +
          `Tu pedido incluye:\n${productsList}\n\n` +
          `Total a pagar: ${orderPrice}\n\n` +
          `¿Te puedo ayudar a finalizar tu compra? 🛍️`;
        break;

      case OrderStatus.CREATED:
        message =
          `${baseMessage}Te escribo respecto a tu orden #${order.orderNumber} en P de Papel.\n\n` +
          `Estamos esperando la confirmación de tu pago para proceder con el envío de:\n${productsList}\n\n` +
          `Total: ${orderPrice}\n\n` +
          `¿Ya realizaste el pago? Puedes enviarnos el comprobante por este medio 📸`;
        break;

      case OrderStatus.PAID:
        message =
          `${baseMessage}¡Gracias por tu compra en P de Papel! 🎉\n\n` +
          `Tu orden #${order.orderNumber} está confirmada y pronto será despachada.\n\n` +
          `Productos:\n${productsList}\n\n` +
          `Te mantendremos informado sobre el estado de tu envío 📦`;
        break;

      case OrderStatus.CANCELLED:
        message =
          `${baseMessage}Te escribo respecto a tu orden #${order.orderNumber} en P de Papel.\n\n` +
          `Notamos que tu orden fue cancelada. ¿Te gustaría comentarnos el motivo?\n` +
          `Nos ayudaría mucho tu retroalimentación para mejorar nuestro servicio 🙏`;
        break;

      default:
        message =
          `${baseMessage}Te escribo respecto a tu orden #${order.orderNumber} en P de Papel.\n\n` +
          `¿En qué te puedo ayudar? 😊`;
        break;
    }
    return encodeEmoji(message);
  }, [order, firstName, orderPrice]);

  const whatsappUrl = `https://wa.me/${formattedPhone}?text=${getMessage}`;
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
