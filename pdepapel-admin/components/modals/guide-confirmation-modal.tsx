import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { currencyFormatter } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

interface GuideConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  selectedQuote?: ShippingQuote;
}

interface ShippingQuote {
  idRate: number;
  carrier: string;
  product: string;
  flete: number;
  minimumInsurance: number;
  totalCost: number;
  deliveryDays: string | number;
  isCOD: boolean;
}

export function GuideConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  loading,
  selectedQuote,
}: GuideConfirmationModalProps): JSX.Element | null {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);
  if (!isMounted) {
    return null;
  }
  return (
    <Modal
      title="Confirmar creación de guía"
      description="Esta orden será marcada como PAGADA y se creará automáticamente una guía de envío con EnvioClick.
        ¿Deseas continuar?"
      isOpen={isOpen}
      onClose={onClose}
    >
      <div className="space-y-3">
        <Alert>
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-semibold">Resumen del envío:</p>
              <div className="space-y-1 text-sm">
                <p>
                  <strong>Transportadora:</strong> {selectedQuote?.carrier}
                </p>
                <p>
                  <strong>Producto:</strong> {selectedQuote?.product}
                </p>
                <p>
                  <strong>Costo:</strong>{" "}
                  {currencyFormatter(selectedQuote?.totalCost || 0)}
                </p>
                <p>
                  <strong>Entrega en:</strong> {selectedQuote?.deliveryDays}{" "}
                  días
                </p>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      </div>
      <div className="flex w-full items-center justify-end space-x-2 pt-6">
        <Button disabled={loading} variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button disabled={loading} variant="destructive" onClick={onConfirm}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Continuar
        </Button>
      </div>
    </Modal>
  );
}
