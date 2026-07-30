"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";
import { AlertTriangle } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface ReceiveItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  items: {
    id: string; // Order Item ID
    productId: string;
    product: { name: string; sku: string };
    quantity: number;
    quantityReceived: number;
    cost: number;
  }[];
}

export const ReceiveItemsModal: React.FC<ReceiveItemsModalProps> = ({
  isOpen,
  onClose,
  orderId,
  items,
}) => {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();

  // Map: productId -> quantity to receive now
  const [receiveQuantities, setReceiveQuantities] = useState<
    Record<string, number>
  >({});

  useEffect(() => {
    if (isOpen) {
      setReceiveQuantities({});
    }
  }, [isOpen]);

  const onQuantityChange = (id: string, value: string) => {
    const qty = parseInt(value) || 0;
    setReceiveQuantities((prev) => ({
      ...prev,
      [id]: qty,
    }));
  };

  const onConfirm = async () => {
    try {
      setLoading(true);

      const payload = Object.entries(receiveQuantities)
        .filter(([_, qty]) => qty > 0)
        .map(([id, qty]) => ({
          restockOrderItemId: id,
          quantityReceived: qty,
        }));

      if (payload.length === 0) {
        toast({
          title: "Ingresa al menos una cantidad para recibir.",
          variant: "destructive",
        });
        return;
      }

      await axios.post(
        `/api/${params.storeId}/restock-orders/${orderId}/receive`,
        {
          receivedItems: payload,
        },
      );

      toast({ title: "Items recibidos correctamente.", variant: "success" });
      router.refresh();
      onClose();
    } catch (error) {
      toast({ title: "Error al recibir items.", variant: "destructive" });
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Recibir Inventario"
      description="Ingresa la cantidad que estás recibiendo físicamente. Esto actualizará el stock inmediatamente."
      isOpen={isOpen}
      onClose={onClose}
      className="max-w-4xl"
    >
      <div className="space-y-4">
        <div className="max-h-[300px] overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Pedido</TableHead>
                <TableHead className="text-right">Recibido</TableHead>
                <TableHead className="w-[100px] text-right">
                  Recibir Ahora
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const remaining = Math.max(
                  0,
                  item.quantity - item.quantityReceived,
                );
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium">{item.product.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.product.sku}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {item.quantity}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.quantityReceived}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <StockQuantityInput
                          min={0}
                          // Removed max constraint to allow over-receiving
                          size="sm"
                          disabled={loading}
                          value={receiveQuantities[item.id] || 0}
                          onChange={(val) =>
                            onQuantityChange(item.id, val.toString())
                          }
                        />
                        {(receiveQuantities[item.id] || 0) > remaining && (
                          <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600">
                            <AlertTriangle className="h-3 w-3" />+
                            {(receiveQuantities[item.id] || 0) - remaining}{" "}
                            extra
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="flex w-full justify-end space-x-2 pt-4">
          <Button disabled={loading} variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={loading} onClick={onConfirm}>
            Confirmar Recepción
          </Button>
        </div>
      </div>
    </Modal>
  );
};
