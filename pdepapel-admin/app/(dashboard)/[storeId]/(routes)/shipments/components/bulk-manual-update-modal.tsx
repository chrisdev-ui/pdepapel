"use client";

import { ShippingStatus } from "@prisma/client";
import { Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Models } from "@/constants";
import { useToast } from "@/hooks/use-toast";

interface BulkManualUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const statuses = [
  { value: ShippingStatus.Shipped, label: "Despachado" },
  { value: ShippingStatus.InTransit, label: "En Tránsito" },
  { value: ShippingStatus.OutForDelivery, label: "En Reparto" },
  { value: ShippingStatus.Delivered, label: "Entregado" },
  { value: ShippingStatus.Exception, label: "Excepción" },
  { value: ShippingStatus.Cancelled, label: "Cancelado" },
];

export const BulkManualUpdateModal: React.FC<BulkManualUpdateModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [isMounted, setIsMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<ShippingStatus | "">("");

  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

  const onConfirm = async () => {
    try {
      setLoading(true);

      const response = await fetch(
        `/api/${params.storeId}/${Models.Shipments}/bulk-manual-update`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );

      if (!response.ok) {
        throw new Error("Something went wrong");
      }

      const data = await response.json();

      toast({
        title: "Actualización exitosa",
        description: `Se actualizaron ${data.count} envíos manuales.`,
      });

      onClose();
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudieron actualizar los envíos.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Actualizar Envíos Manuales"
      description="Esta acción actualizará el estado de TODOS los envíos manuales de la tienda. Ten cuidado."
      isOpen={isOpen}
      onClose={onClose}
    >
      <div className="space-y-4 py-2 pb-4">
        <div className="space-y-2">
          <Label>Nuevo Estado</Label>
          <Select
            disabled={loading}
            onValueChange={(value) => setStatus(value as ShippingStatus)}
            value={status}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona un estado" />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-full items-center justify-end space-x-2 pt-6">
          <Button disabled={loading} variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={loading || !status} onClick={onConfirm}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar Actualización
          </Button>
        </div>
      </div>
    </Modal>
  );
};
