"use client";

import axios from "axios";
import { Copy, CreditCard, Edit, MoreHorizontal, Trash } from "lucide-react";
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
          "¡Cobro enviado al Datáfono Bold! (Si la pantalla del equipo está ocupada, presiona Cancelar 'X' en el datáfono para liberar la cola).",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Error Datáfono Bold",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setPushingBold(false);
    }
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
          "Esta orden fue registrada para Pago por Transferencia Directa o Efectivo. Los links de pago Wompi solo aplican para compras con Pago en Línea.",
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
          description: "Link de pago Wompi copiado al portapapeles",
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
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() =>
              onCopy(
                `https://papeleriapdepapel.com/order/${data.id}`,
                "URL de la orden copiada la portapapeles",
              )
            }
          >
            <Copy className="mr-2 h-4 w-4" />
            Copiar URL de la orden
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer"
            disabled={copyingWompi || isClosedOrder || isOfflinePayment}
            onClick={onCopyWompiLink}
          >
            <CreditCard className="mr-2 h-4 w-4" />
            {isClosedOrder
              ? `Link de Pago (Orden ${data.status === OrderStatus.PAID ? "Pagada" : "Enviada"})`
              : isOfflinePayment
                ? "Link de Pago (Transferencia Directa)"
                : "Copiar Link de Pago Wompi"}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() =>
              onCopy(
                `https://papeleriapdepapel.com/order/${data.id}?autoPay=true`,
                "Link de pago Bold copiado al portapapeles",
              )
            }
          >
            <CreditCard className="mr-2 h-4 w-4 text-emerald-600" />
            Copiar Link de Pago Bold
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer"
            disabled={pushingBold || isClosedOrder}
            onClick={onPushBoldDatafono}
          >
            <CreditCard className="mr-2 h-4 w-4 text-emerald-600" />
            {isClosedOrder
              ? "Datáfono Bold (Orden Completada)"
              : "Cobrar en Datáfono Bold"}
          </DropdownMenuItem>
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
            Actualizar
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer"
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
