import { Button } from "@/components/ui/button";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle,
  ClipboardList,
  Clock,
  FileWarning,
  Heart,
  History,
  Loader2,
  PartyPopper,
  SearchX,
  Sparkles,
  XCircle,
} from "lucide-react";
import { ReactNode } from "react";

type StatusType =
  | "loading"
  | "not-found"
  | "expired"
  | "cancelled"
  | "processed"
  | "accepted-manual";

interface QuoteStatusMessageProps {
  type: StatusType;
  orderNumber?: string;
  onGoHome?: () => void;
}

interface StatusConfig {
  icon: typeof Loader2;
  iconClass: string;
  bgClass: string;
  title: string;
  message: string;
  emoji: ReactNode;
  showButton: boolean;
  buttonText?: string;
}

const statusConfigs: Record<StatusType, StatusConfig> = {
  loading: {
    icon: Loader2,
    iconClass: "text-blue-400 animate-spin",
    bgClass: "bg-blue-50",
    title: "Cargando tu cotización...",
    message: "Dame un momento...",
    emoji: <Sparkles className="h-12 w-12 text-blue-300" />,
    showButton: false,
  },
  "not-found": {
    icon: AlertCircle,
    iconClass: "text-pink-500",
    bgClass: "bg-pink-50",
    title: "Cotización no encontrada",
    message: "La cotización que buscas no existe o el enlace es incorrecto.",
    emoji: <SearchX className="h-12 w-12 text-pink-400" />,
    showButton: true,
    buttonText: "Volver al inicio",
  },
  expired: {
    icon: Clock,
    iconClass: "text-orange-400",
    bgClass: "bg-orange-50",
    title: "Cotización Expirada",
    message:
      "Esta cotización ha excedido su tiempo de validez. Por favor, contacta a nuestro equipo para generar una nueva.",
    emoji: <History className="h-12 w-12 text-orange-300" />,
    showButton: true,
    buttonText: "Volver al inicio",
  },
  cancelled: {
    icon: XCircle,
    iconClass: "text-red-500",
    bgClass: "bg-red-50",
    title: "Cotización Cancelada",
    message:
      "Esta cotización ha sido cancelada. Si tienes preguntas, contáctanos.",
    emoji: <FileWarning className="h-12 w-12 text-red-400" />,
    showButton: true,
    buttonText: "Volver al inicio",
  },
  processed: {
    icon: CheckCircle,
    iconClass: "text-green-500",
    bgClass: "bg-green-50",
    title: "¡Orden Confirmada!",
    message:
      "Esta orden ya ha sido pagada y procesada. ¡Gracias por tu compra!",
    emoji: <PartyPopper className="h-12 w-12 text-green-400" />,
    showButton: true,
    buttonText: "Seguir comprando",
  },
  "accepted-manual": {
    icon: Sparkles,
    iconClass: "text-purple-400",
    bgClass: "bg-purple-50",
    title: "Orden en Proceso",
    message:
      "Has aceptado esta cotización. Un asesor revisará los detalles y te contactará para finalizar el pago y envío.",
    emoji: <ClipboardList className="h-12 w-12 text-purple-300" />,
    showButton: false,
  },
};

const QuoteStatusMessage = ({
  type,
  orderNumber,
  onGoHome,
}: QuoteStatusMessageProps) => {
  const config = statusConfigs[type];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className="flex min-h-[60vh] items-center justify-center bg-gray-50/50 p-4"
    >
      <div className="max-w-md text-center">
        {/* Animated icon container */}
        <motion.div
          className={`mx-auto h-24 w-24 rounded-full ${config.bgClass} mb-6 flex items-center justify-center shadow-sm`}
          animate={{
            scale: [1, 1.05, 1],
            rotate: type === "loading" ? 360 : 0,
          }}
          transition={{
            scale: { duration: 2, repeat: Infinity },
            rotate:
              type === "loading"
                ? { duration: 2, repeat: Infinity, ease: "linear" }
                : {},
          }}
        >
          <Icon className={`h-12 w-12 ${config.iconClass}`} />
        </motion.div>

        {/* Emoji */}
        <motion.div
          className="mb-4 text-5xl"
          animate={{
            y: [0, -5, 0],
            rotate: [0, 5, -5, 0],
          }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          {config.emoji}
        </motion.div>

        {/* Title */}
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-3 text-2xl font-extrabold text-gray-900 md:text-3xl"
        >
          {config.title}
        </motion.h2>

        {/* Order number for processed */}
        {type === "processed" && orderNumber && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mb-3 text-lg font-semibold text-blue-600"
          >
            Orden #{orderNumber}
          </motion.p>
        )}

        {/* Message */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="leading-relaxed text-gray-500"
        >
          {config.message}
        </motion.p>

        {/* Button */}
        {config.showButton && onGoHome && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-6"
          >
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                onClick={onGoHome}
                className="rounded-full bg-gradient-to-r from-pink-400 to-purple-400 px-8 text-white hover:opacity-90"
                size="lg"
              >
                <Heart className="mr-2 h-4 w-4" />
                {config.buttonText}
              </Button>
            </motion.div>
          </motion.div>
        )}

        {/* Decorative elements */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <AnimatePresence>
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute h-3 w-3 rounded-full"
                style={{
                  background:
                    i % 3 === 0
                      ? "pink"
                      : i % 3 === 1
                      ? "lightblue"
                      : "lavender",
                  left: `${10 + i * 15}%`,
                  top: `${20 + (i % 4) * 20}%`,
                  opacity: 0.3,
                }}
                animate={{
                  y: [0, -30, 0],
                  opacity: [0.3, 0.6, 0.3],
                }}
                transition={{
                  duration: 3 + i * 0.5,
                  repeat: Infinity,
                  delay: i * 0.3,
                }}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
};

export default QuoteStatusMessage;
