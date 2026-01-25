import { Button } from "@/components/ui/button";
import { currencyFormatter } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { motion } from "framer-motion";
import {
  Calculator,
  Calendar,
  CheckCircle,
  CreditCard,
  Flower2,
  Gift,
  Loader2,
  Printer,
  Receipt,
  Sparkles,
  Truck,
} from "lucide-react";
import { QuoteChangeRequestDialog } from "./QuoteChangeRequestDialog";

interface QuoteSummaryProps {
  subtotal: number;
  shippingCost?: number;
  discount?: number;
  total: number;
  validUntil?: string;
  status: string;
  hasManualItems: boolean;
  isAccepting: boolean;
  onAccept: () => void;
  onProceedToPayment: () => void;
  onRequestChange: (message: string) => Promise<void>;
  onPrint: () => void;
}

const QuoteSummary = ({
  subtotal,
  shippingCost,
  discount = 0,
  total,
  validUntil,
  status,
  hasManualItems,
  isAccepting,
  onAccept,
  onProceedToPayment,
  onRequestChange,
  onPrint,
}: QuoteSummaryProps) => {
  const isAccepted = status === "ACCEPTED";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="sticky top-28 rounded-3xl border border-gray-100 bg-white p-6 shadow-lg"
    >
      {/* Header decoration */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <Sparkles className="h-5 w-5 text-pink-400" />
          Resumen
        </h3>
        <motion.div
          animate={{ rotate: [0, 10, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
        >
          <Receipt className="h-8 w-8 text-blue-200" />
        </motion.div>
      </div>

      {/* Summary items */}
      <div className="space-y-3 border-b border-gray-100 pb-4">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Subtotal</span>
          <span className="font-serif font-medium text-gray-900">
            {currencyFormatter.format(subtotal)}
          </span>
        </div>

        <div className="flex justify-between text-sm">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            <span className="text-gray-500">Envío</span>
          </div>
          {shippingCost !== undefined && shippingCost !== null ? (
            <span className="font-serif font-medium text-gray-900">
              {currencyFormatter.format(shippingCost)}
            </span>
          ) : (
            <span className="flex items-center gap-1 font-medium text-blue-400">
              Por calcular <Calculator className="h-4 w-4" />
            </span>
          )}
        </div>

        {discount > 0 && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex justify-between text-sm"
          >
            <span className="flex items-center gap-2 text-green-500">
              <Gift className="h-4 w-4" /> Descuento
            </span>
            <span className="font-serif font-medium text-green-500">
              - {currencyFormatter.format(discount)}
            </span>
          </motion.div>
        )}
      </div>

      {/* Total */}
      <motion.div
        className="mb-4 pt-4"
        whileHover={{ scale: 1.02 }}
        transition={{ type: "spring", stiffness: 400 }}
      >
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold text-gray-900">Total</span>
          <motion.span
            className="font-serif text-2xl font-extrabold text-blue-600"
            animate={{ scale: [1, 1.02, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            {currencyFormatter.format(total)}
          </motion.span>
        </div>

        {validUntil && (
          <p className="mt-2 flex items-center justify-end gap-1 text-xs text-gray-500">
            <Calendar className="h-3 w-3" />
            Válido hasta:{" "}
            {format(new Date(validUntil), "PPP", {
              locale: es,
            })}
          </p>
        )}
      </motion.div>

      {/* Actions */}
      <div className="space-y-3">
        {isAccepted ? (
          hasManualItems ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Button
                disabled
                className="w-full rounded-xl bg-blue-100/50 text-blue-700 hover:bg-blue-100"
                size="lg"
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Aceptada
                <Sparkles className="ml-2 h-4 w-4" />
              </Button>
            </motion.div>
          ) : (
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                onClick={onProceedToPayment}
                className="w-full rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-md hover:opacity-90"
                size="lg"
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Proceder al Pago
              </Button>
            </motion.div>
          )
        ) : (
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button
              onClick={onAccept}
              disabled={isAccepting}
              className="w-full rounded-xl bg-gradient-to-r from-pink-400 via-purple-400 to-blue-400 text-white shadow-md hover:opacity-90"
              size="lg"
            >
              {isAccepting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <span className="mr-2">
                  <Flower2 className="h-5 w-5" />
                </span>
              )}
              Aceptar Cotización
            </Button>
          </motion.div>
        )}

        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <QuoteChangeRequestDialog onRequestChange={onRequestChange} />
        </motion.div>

        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button
            variant="outline"
            onClick={onPrint}
            className="w-full rounded-xl border-gray-200 hover:bg-gray-50"
          >
            <Printer className="mr-2 h-4 w-4" />
            Imprimir / Guardar PDF
          </Button>
        </motion.div>
      </div>

      {/* Footer note */}
      <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs leading-relaxed text-gray-400">
        Al aceptar, confirmas tu interés en estos productos{" "}
        <Flower2 className="h-3 w-3 text-pink-300" />
      </p>
    </motion.div>
  );
};

export default QuoteSummary;
