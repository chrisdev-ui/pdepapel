import { CustomOrderStatus } from "@prisma/client";
import {
  ArrowRightCircle,
  CheckCircle,
  Clock,
  Eye,
  FileText,
  LucideIcon,
  MessageCircle,
  Send,
  Slash,
  XCircle,
} from "lucide-react";

export const CUSTOM_ORDER_STATUS_LABELS: Record<CustomOrderStatus, string> = {
  DRAFT: "Borrador",
  SENT: "Enviado",
  VIEWED: "Visto",
  NEGOTIATING: "En Negociación",
  ACCEPTED: "Aceptado",
  REJECTED: "Rechazado",
  CONVERTED: "Convertido a Orden",
  EXPIRED: "Expirado",
  CANCELLED: "Cancelado",
};

export const CUSTOM_ORDER_STATUS_ICONS: Record<CustomOrderStatus, LucideIcon> =
  {
    DRAFT: FileText,
    SENT: Send,
    VIEWED: Eye,
    NEGOTIATING: MessageCircle,
    ACCEPTED: CheckCircle,
    REJECTED: XCircle,
    CONVERTED: ArrowRightCircle,
    EXPIRED: Clock,
    CANCELLED: Slash,
  };

export const CUSTOM_ORDER_STATUS_COLORS: Record<CustomOrderStatus, string> = {
  DRAFT: "bg-gray-500",
  SENT: "bg-blue-500",
  VIEWED: "bg-cyan-500",
  NEGOTIATING: "bg-yellow-500",
  ACCEPTED: "bg-green-500",
  REJECTED: "bg-rose-500",
  CONVERTED: "bg-purple-600",
  EXPIRED: "bg-orange-500",
  CANCELLED: "bg-red-500",
};
