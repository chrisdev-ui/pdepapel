"use client";

import axios from "axios";
import {
  Copy,
  CreditCard,
  Edit,
  MessageSquare,
  MoreHorizontal,
  Trash,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { AlertModal } from "@/components/modals/alert-modal";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Models } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { OrderStatus, PaymentMethod } from "@prisma/client";
import { OrderColumn } from "./columns";

interface CellActionProps {
  data: OrderColumn;
}

export const CellAction: React.FC<CellActionProps> = ({ data }) => {
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [copyingWompi, setCopyingWompi] = useState(false);
  const [pushingBold, setPushingBold] = useState(false);

  const isClosedOrder =
    data.status === OrderStatus.PAID || data.status === OrderStatus.SENT;
  const isPointOfSale = data.type === "POINT_OF_SALE";

  const isOfflinePayment =
    Boolean(data.payment?.method) &&
    data.payment?.method !== PaymentMethod.Wompi;

  const onCopy = (id: string, message: string) => {
    navigator.clipboard.writeText(id);
    toast({
      description: message,
      variant: "success",
    });
  };

  const onPushBoldDatafono = async () => {
    if (isClosedOrder) {
      toast({
        title: "Orden Cerrada",
        description: `Esta orden ya está completada (${data.status === OrderStatus.PAID ? "Pagada" : "Enviada"}).`,
        variant: "destructive",
      });
      return;
    }

    try {
      setPushingBold(true);
      const response = await axios.post(
        `/api/${params.storeId}/bold/terminal/${data.id}`,
      );
      toast({
        title: "Notificación enviada",
        description:
          response.data?.message ||
          "¡Cobro enviado al datáfono! (Si la pantalla del equipo está ocupada, presiona Cancelar 'X' en el datáfono para liberar la cola).",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Error de datáfono",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setPushingBold(false);
    }
  };

  const onSendWhatsAppStatus = () => {
    const rawPhone = data.phone ? data.phone.replace(/\D/g, "") : "";
    const cleanPhone = rawPhone.length === 10 ? `57${rawPhone}` : rawPhone;
    const orderUrl = `https://papeleriapdepapel.com/pedido/${data.id}`;
    const statusText =
      data.status === OrderStatus.PAID
        ? "Pagada y Confirmada"
        : data.status === OrderStatus.SENT
          ? "Enviada"
          : data.status === OrderStatus.PENDING
            ? "Pendiente de Pago"
            : data.status;
    const text = encodeURIComponent(
      `¡Hola ${data.fullName || "Cliente"}! 👋 Te escribimos de Papelería P de Papel. Tu orden #${data.orderNumber} se encuentra actualmente en estado: ${statusText}. Puedes ver los detalles de tu pedido aquí: ${orderUrl}`,
    );
    window.open(`https://wa.me/${cleanPhone}?text=${text}`, "_blank");
  };

  const onCopyWompiLink = async () => {
    if (isClosedOrder) {
      toast({
        title: "Orden Cerrada",
        description: `Esta orden ya está cerrada (${data.status === OrderStatus.PAID ? "Pagada" : "Enviada"}). No es necesario ni posible generar un nuevo link de pago.`,
        variant: "destructive",
      });
      return;
    }

    if (isOfflinePayment) {
      toast({
        title: "Pago por Transferencia / Directo",
        description:
          "Esta orden fue registrada para transferencia directa o efectivo. Los enlaces de pago solo aplican para pagos en línea.",
        variant: "destructive",
      });
      return;
    }

    try {
      setCopyingWompi(true);
      const response = await axios.post(
        `/api/${params.storeId}/checkout/${data.id}`,
      );
      if (response.data?.url) {
        navigator.clipboard.writeText(response.data.url);
        toast({
          description: "Enlace de pago copiado al portapapeles",
          variant: "success",
        });
      } else {
        throw new Error("No se pudo obtener el link de pago");
      }
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setCopyingWompi(false);
    }
  };

  const onDelete = async () => {
    try {
      setLoading(true);
      await axios.delete(`/api/${params.storeId}/${Models.Orders}/${data.id}`);
      router.refresh();
      toast({
        description: "Orden eliminada",
        variant: "success",
      });
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <>
      <AlertModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={onDelete}
        loading={loading}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Abrir Menú</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Acciones</DropdownMenuLabel>
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() =>
              onCopy(data.id, "ID de la orden copiada la portapapeles")
            }
          >
            <Copy className="mr-2 h-4 w-4" />
            Copiar ID
          </DropdownMenuItem>
          {!isPointOfSale && (
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() =>
                onCopy(
                  `https://papeleriapdepapel.com/pedido/${data.id}`,
                  "URL de la orden copiada la portapapeles",
                )
              }
            >
              <Copy className="mr-2 h-4 w-4" />
              Copiar URL de la orden
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="cursor-pointer"
            disabled={
              isPointOfSale || copyingWompi || isClosedOrder || isOfflinePayment
            }
            onClick={onCopyWompiLink}
          >
            <CreditCard className="mr-2 h-4 w-4" />
            {isClosedOrder
              ? `Link de Pago (Orden ${data.status === OrderStatus.PAID ? "Pagada" : "Enviada"})`
              : isOfflinePayment
                ? "Link de Pago (Transferencia Directa)"
                : "Copiar enlace de pago"}
          </DropdownMenuItem>
          {!isPointOfSale && (
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() =>
                onCopy(
                  `https://papeleriapdepapel.com/pedido/${data.id}?autoPay=true`,
                  "Enlace de pago copiado al portapapeles",
                )
              }
            >
              <CreditCard className="mr-2 h-4 w-4 text-emerald-600" />
              Copiar enlace de pago
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="cursor-pointer"
            disabled={isPointOfSale || pushingBold || isClosedOrder}
            onClick={onPushBoldDatafono}
          >
            <CreditCard className="mr-2 h-4 w-4 text-emerald-600" />
            {isClosedOrder
              ? "Datáfono (Orden completada)"
              : "Cobrar en datáfono"}
          </DropdownMenuItem>
          {!isPointOfSale && (
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={onSendWhatsAppStatus}
            >
              <MessageSquare className="mr-2 h-4 w-4 text-emerald-600" />
              Enviar WhatsApp al cliente
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() =>
              onCopy(
                data.orderNumber,
                "Número de la orden copiado al portapapeles",
              )
            }
          >
            <Copy className="mr-2 h-4 w-4" />
            Copiar Número de orden
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() =>
              router.push(`/${params.storeId}/${Models.Orders}/${data.id}`)
            }
          >
            <Edit className="mr-2 h-4 w-4" />
            {isPointOfSale ? "Ver detalle" : "Actualizar"}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer"
            disabled={isPointOfSale}
            onClick={() => setOpen(true)}
          >
            <Trash className="mr-2 h-4 w-4" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
