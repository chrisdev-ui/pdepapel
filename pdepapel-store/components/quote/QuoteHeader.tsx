import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  CreditCard,
  Eye,
  FileText,
  Hourglass,
  PartyPopper,
  Sparkles,
  User,
} from "lucide-react";

interface QuoteHeaderProps {
  orderNumber?: string;
  orderId: string;
  status: string;
  customerName?: string;
}

const QuoteHeader = ({
  orderNumber,
  orderId,
  status,
  customerName,
}: QuoteHeaderProps) => {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case "ACCEPTED":
        return {
          label: "Aceptada",
          icon: CheckCircle2,
          className: "bg-green-100 text-green-700 border-green-200",
        };
      case "VIEWED":
        return {
          label: "Vista",
          icon: Eye,
          className: "bg-blue-100 text-blue-700 border-blue-200",
        };
      case "QUOTATION":
        return {
          label: "Pendiente",
          icon: Hourglass,
          className: "bg-yellow-100 text-yellow-700 border-yellow-200",
        };
      case "PENDING":
        return {
          label: "Pendiente de Pago",
          icon: CreditCard,
          className: "bg-orange-100 text-orange-700 border-orange-200",
        };
      case "PAID":
        return {
          label: "Pagada",
          icon: PartyPopper,
          className: "bg-purple-100 text-purple-700 border-purple-200",
        };
      default:
        return {
          label: status,
          icon: FileText,
          className: "bg-gray-100 text-gray-700 border-gray-200",
        };
    }
  };

  const statusConfig = getStatusConfig(status);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300 }}
      className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-pink-50 via-white to-blue-50 p-6 shadow-lg md:p-8"
    >
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute h-16 w-16 rounded-full opacity-20"
            style={{
              background: i % 2 === 0 ? "pink" : "lightblue",
              left: `${20 + i * 20}%`,
              top: `${10 + (i % 3) * 30}%`,
            }}
            animate={{
              y: [0, -10, 0],
              scale: [1, 1.1, 1],
            }}
            transition={{
              duration: 3 + i,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      <div className="relative z-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          {/* Title section */}
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <motion.div
                className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 shadow-sm backdrop-blur-sm"
                animate={{ scale: [1, 1.02, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <FileText className="h-4 w-4 text-pink-500" />
                <span className="text-sm font-semibold text-gray-800">
                  Cotización Especial
                </span>
              </motion.div>

              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  repeatDelay: 3,
                }}
              >
                <Sparkles className="h-6 w-6 text-yellow-400" />
              </motion.div>
            </div>

            <motion.h1
              className="mt-3 flex items-center gap-2 text-2xl font-extrabold text-gray-900 md:text-3xl"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Sparkles className="h-6 w-6 text-pink-500" />#
              {orderNumber || orderId.slice(0, 8)}
            </motion.h1>
          </div>

          {/* Status badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, type: "spring" }}
          >
            <Badge
              variant="outline"
              className={`flex items-center gap-1.5 px-4 py-2 text-sm ${statusConfig.className}`}
            >
              <statusConfig.icon className="h-4 w-4" />
              {statusConfig.label}
            </Badge>
          </motion.div>
        </div>

        {/* Customer info */}
        {customerName && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-4 flex items-center gap-2 text-gray-500"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
              <User className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Cliente</p>
              <p className="font-semibold text-gray-900">{customerName}</p>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default QuoteHeader;
