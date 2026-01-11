import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { currencyFormatter } from "@/lib/utils";
import { FileText, Loader2, Save } from "lucide-react";
import { useEffect, useState } from "react";

interface GuideConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onSaveWithoutGuide: () => void;
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
  onSaveWithoutGuide,
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
      title="¿Crear guía de envío automáticamente?"
      description="La orden será marcada como PAGADA. Puedes crear la guía ahora o más tarde desde el detalle de la orden."
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
      <div className="flex w-full flex-col gap-2 pt-6 sm:flex-row sm:items-center sm:justify-end">
        <Button disabled={loading} variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          disabled={loading}
          variant="secondary"
          onClick={onSaveWithoutGuide}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Save className="mr-2 h-4 w-4" />
          Guardar sin Guía
        </Button>
        <Button disabled={loading} variant="default" onClick={onConfirm}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <FileText className="mr-2 h-4 w-4" />
          Crear Guía
        </Button>
      </div>
    </Modal>
  );
}
