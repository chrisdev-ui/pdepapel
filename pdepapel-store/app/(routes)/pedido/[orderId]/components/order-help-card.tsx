import { ChevronRight, MessageCircle, Undo2 } from "lucide-react";
import Link from "next/link";

import { Icons } from "@/components/icons";
import { getOrderSupportWhatsAppUrl } from "@/lib/order-status";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { OrderSection } from "./order-section";

interface OrderHelpCardProps {
  orderNumber: string;
}

export function OrderHelpCard({ orderNumber }: OrderHelpCardProps) {
  const links = [
    {
      id: "whatsapp",
      title: "Escribir por WhatsApp",
      description: `Con el número ${orderNumber} listo en el mensaje`,
      href: getOrderSupportWhatsAppUrl(orderNumber),
      external: true,
      icon: <Icons.whatsapp className="h-[18px] w-[18px] text-green-600" aria-hidden="true" />,
      tile: "bg-green-50",
    },
    {
      id: "returns",
      title: "Cambios y devoluciones",
      description: "Hasta 5 días calendario después de recibir",
      href: STOREFRONT_ROUTES.returnsPolicy,
      icon: <Undo2 className="h-[18px] w-[18px]" aria-hidden="true" />,
      tile: "bg-kawaii-pink-light",
    },
  ];

  return (
    <OrderSection
      id="pedido-ayuda"
      title="¿Necesitas ayuda con este pedido?"
      icon={MessageCircle}
      tint="bg-kawaii-mint-light"
      className="print:hidden"
    >
      <ul className="divide-y divide-border">
        {links.map((link) => (
          <li key={link.id}>
            <Link
              href={link.href}
              target={link.external ? "_blank" : undefined}
              rel={link.external ? "noopener noreferrer" : undefined}
              className="group flex min-h-[44px] items-center gap-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink focus-visible:ring-offset-2"
            >
              <span
                className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-blue-yankees ${link.tile}`}
              >
                {link.icon}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-semibold text-blue-yankees">
                  {link.title}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {link.description}
                </span>
              </span>
              <ChevronRight
                aria-hidden="true"
                className="h-[18px] w-[18px] shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Respondemos en 12 a 24 horas, todos los días de 8:00 a. m. a 8:00 p. m.
      </p>
    </OrderSection>
  );
}
