"use client";

import { cn } from "@/lib/utils";
import { OrderStatus as DbStatus } from "@prisma/client";
import { AnimatePresence, motion } from "framer-motion";
import {
  Ban,
  CheckCircle,
  CreditCard,
  FileText,
  Gift,
  Sparkles,
  ThumbsUp,
  Truck,
  XCircle,
} from "lucide-react";
import * as React from "react";

// Use DbStatus key for mapping
type OrderStatusKey = DbStatus;

interface StatusConfig {
  id: string; // db value
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  emoji: string;
  message: string;
  subMessage: string;
}

// Map DB Statuses to the linear flow (Standard Happy Path)
// We will filter out "CANCELLED" / "REJECTED" from the linear visual flow if the order is effectively cancelled
// But for now, let's define the configuration for all of them.

const STATUS_CONFIG: Record<OrderStatusKey, StatusConfig> = {
  // 1. Initial / Quote Stage
  DRAFT: {
    id: "DRAFT",
    label: "Borrador",
    icon: <FileText className="h-5 w-5" />,
    color: "text-slate-500",
    bgColor: "bg-slate-100",
    emoji: "📝",
    message: "Borrador de Orden",
    subMessage: "Editando detalles... ✏️",
  },
  QUOTATION: {
    id: "QUOTATION",
    label: "Cotización",
    icon: <Sparkles className="h-5 w-5" />,
    color: "text-violet-400",
    bgColor: "bg-violet-100",
    emoji: "📄",
    message: "Cotización Enviada",
    subMessage: "¡Esperando aprobación! ✨",
  },
  VIEWED: {
    id: "VIEWED",
    label: "Visto",
    icon: <Sparkles className="h-5 w-5" />,
    color: "text-blue-400",
    bgColor: "bg-blue-100",
    emoji: "👀",
    message: "¡Ya lo vieron!",
    subMessage: "¡Esperamos su respuesta! 💭",
  },
  ACCEPTED: {
    id: "ACCEPTED",
    label: "Aceptada",
    icon: <ThumbsUp className="h-5 w-5" />,
    color: "text-emerald-400",
    bgColor: "bg-emerald-100",
    emoji: "👍",
    message: "¡Oferta Aceptada!",
    subMessage: "¡Excelente elección! Procesando... 💖",
  },
  REJECTED: {
    id: "REJECTED",
    label: "Rechazada",
    icon: <Ban className="h-5 w-5" />,
    color: "text-red-400",
    bgColor: "bg-red-100",
    emoji: "💔",
    message: "Oferta Rechazada",
    subMessage: "Quizás la próxima... 😢",
  },
  // 2. Processing Stage
  CREATED: {
    id: "CREATED",
    label: "Creada",
    icon: <Gift className="h-5 w-5" />,
    color: "text-pink-400",
    bgColor: "bg-pink-100",
    emoji: "🎀",
    message: "¡Orden Creada!",
    subMessage: "¡Qué emoción! Iniciando... ✨",
  },
  PENDING: {
    id: "PENDING",
    label: "Pendiente",
    icon: <CreditCard className="h-5 w-5" />,
    color: "text-orange-400",
    bgColor: "bg-orange-100",
    emoji: "💳",
    message: "Procesando Pago",
    subMessage: "Verificando transacción... 🔍",
  },
  PAID: {
    id: "PAID",
    label: "Pagado",
    icon: <CheckCircle className="h-5 w-5" />,
    color: "text-emerald-500",
    bgColor: "bg-emerald-100",
    emoji: "💸",
    message: "¡Pago Confirmado!",
    subMessage: "¡Todo listo! Preparando paquete... 🌟",
  },
  // 3. Shipping Stage
  SENT: {
    id: "SENT",
    label: "Enviado",
    icon: <Truck className="h-5 w-5" />,
    color: "text-cyan-500",
    bgColor: "bg-cyan-100",
    emoji: "🚚",
    message: "¡En Camino!",
    subMessage: "¡Tu paquete va en ruta! 🎈",
  },
  CANCELLED: {
    id: "CANCELLED",
    label: "Cancelado",
    icon: <XCircle className="h-5 w-5" />,
    color: "text-red-500",
    bgColor: "bg-red-100",
    emoji: "🚫",
    message: "Orden Cancelada",
    subMessage: "Esta orden fue detenida. 🛑",
  },
};

// Define the linear standard progression
const STATUS_ORDER: DbStatus[] = [
  "DRAFT",
  "QUOTATION",
  "VIEWED",
  "ACCEPTED",
  "CREATED", // or Placed
  "PENDING",
  "PAID",
  "SENT",
  // Delivered usually inferred or added later
];

interface OrderStatusSelectorProps {
  currentStatus: DbStatus;
  onStatusChange?: (status: DbStatus) => void;
  readOnly?: boolean;
  className?: string;
}

const KawaiiIcon = ({
  children,
  isActive,
  isCompleted,
}: {
  children: React.ReactNode;
  isActive: boolean;
  isCompleted: boolean;
}) => {
  return (
    <motion.div
      className="relative"
      animate={isActive ? { scale: [1, 1.1, 1] } : {}}
      transition={{
        duration: 0.5,
        repeat: isActive ? Infinity : 0,
        repeatDelay: 1,
      }}
    >
      {children}
      {/* Cute face overlay */}
      <AnimatePresence>
        {(isActive || isCompleted) && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
            className="absolute -bottom-1 -right-1"
          >
            <span className="text-xs">✨</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export function OrderStatusSelector({
  currentStatus,
  onStatusChange,
  readOnly,
  className,
}: OrderStatusSelectorProps) {
  // If status is terminal (cancelled/rejected), we just show that single state or handle differently
  // For the stepper, we'll try to map it index-wise if it's in the list.
  // If it's Cancelled/Rejected, we might want to just show that or default to 0 progress.

  let displayOrder = STATUS_ORDER;
  let currentIndex = STATUS_ORDER.indexOf(currentStatus);
  let isTerminalFailure =
    currentStatus === "CANCELLED" || currentStatus === "REJECTED";

  // If the current status is not in the standard flow (e.g. it is Rejected),
  // we can append it to the end or just show it isolated.
  // Let's ensure it appears in the list so the user can see it selected.
  if (currentIndex === -1) {
    // Check if it's one of the known ones not in list
    if (STATUS_CONFIG[currentStatus]) {
      // It's a valid status but not in our happy path list.
      // We'll just force the list to be [..., current] effectively or
      // simpler: Replace the list with just this one? No, user wants stepper.
      // Strategy: Use standard list, but if 'Cancelled' is selected, highlight nothing?
      // Better strategy: Add Cancelled/Rejected to the end dynamically if active.
      displayOrder = [...STATUS_ORDER, currentStatus];
      currentIndex = displayOrder.length - 1;
    }
  }

  const currentStatusData =
    STATUS_CONFIG[currentStatus] || STATUS_CONFIG["DRAFT"];

  return (
    <div className={cn("mx-auto w-full max-w-5xl", className)}>
      {/* Scrollable status container */}
      <div className="scrollbar-hide relative overflow-x-auto pb-4">
        <div className="min-w-max px-4 py-6">
          {/* Background line */}
          <div
            className="absolute left-8 right-8 top-1/2 h-2 -translate-y-1/2 rounded-full bg-muted"
            style={{ width: "calc(100% - 4rem)", minWidth: "900px" }}
          />

          {/* Animated progress line */}
          <motion.div
            className={cn(
              "absolute left-8 top-1/2 h-2 -translate-y-1/2 rounded-full",
              isTerminalFailure
                ? "bg-red-200"
                : "bg-gradient-to-r from-pink-300 via-violet-300 to-emerald-300",
            )}
            initial={{ width: "0%" }}
            animate={{
              width: `${(currentIndex / (displayOrder.length - 1)) * 100}%`,
            }}
            transition={{
              type: "spring",
              stiffness: 100,
              damping: 20,
              mass: 1,
            }}
            style={{
              maxWidth: "100%", // Limit to container width logic handled by parent usually but here strictly absolute
            }}
          />

          {/* Status icons */}
          <div
            className="relative flex justify-between"
            style={{ minWidth: "900px" }}
          >
            {displayOrder.map((statusKey, index) => {
              const config = STATUS_CONFIG[statusKey];
              const isCompleted = index < currentIndex;
              const isActive = index === currentIndex;
              const isClickable = !readOnly && onStatusChange;

              if (!config) return null;

              return (
                <motion.button
                  type="button" // Prevent form submission
                  key={config.id}
                  onClick={() => isClickable && onStatusChange(statusKey)}
                  className={cn(
                    "group relative flex flex-col items-center gap-2 px-2",
                    isClickable ? "cursor-pointer" : "cursor-default",
                  )}
                  whileHover={isClickable ? { scale: 1.05 } : {}}
                  whileTap={isClickable ? { scale: 0.95 } : {}}
                  disabled={!isClickable}
                >
                  {/* Icon container */}
                  <motion.div
                    className={cn(
                      "relative flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm transition-colors duration-300",
                      isActive || isCompleted ? config.bgColor : "bg-card",
                      isActive ? "ring-2 ring-primary/40" : "border",
                    )}
                    initial={false}
                    animate={{
                      y: isActive ? -6 : 0,
                    }}
                    transition={{
                      type: "spring",
                      stiffness: 400,
                      damping: 25,
                    }}
                  >
                    {/* Icon */}
                    <motion.div
                      className={cn(
                        isCompleted || isActive
                          ? config.color
                          : "text-muted-foreground",
                      )}
                      animate={
                        isActive
                          ? {
                              rotate: [0, -8, 8, -8, 0],
                            }
                          : {}
                      }
                      transition={{
                        duration: 0.5,
                        repeat: isActive ? Infinity : 0,
                        repeatDelay: 2,
                      }}
                    >
                      <KawaiiIcon isActive={isActive} isCompleted={isCompleted}>
                        {config.icon}
                      </KawaiiIcon>
                    </motion.div>

                    {/* Completed checkmark */}
                    <AnimatePresence>
                      {isCompleted && !isTerminalFailure && (
                        <motion.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          transition={{
                            type: "spring",
                            stiffness: 500,
                            damping: 25,
                          }}
                          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400 shadow-sm"
                        >
                          <CheckCircle className="h-3 w-3 text-white" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>

                  {/* Label */}
                  <motion.span
                    className={cn(
                      "max-w-[80px] whitespace-normal text-center text-xs font-semibold leading-tight",
                      isActive
                        ? "text-primary"
                        : isCompleted
                          ? "text-foreground"
                          : "text-muted-foreground",
                    )}
                    animate={{
                      scale: isActive ? 1.05 : 1,
                    }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    {config.label}
                  </motion.span>

                  {/* Active dot */}
                  <AnimatePresence>
                    {isActive && (
                      <motion.div
                        initial={{ scaleX: 0, opacity: 0 }}
                        animate={{ scaleX: 1, opacity: 1 }}
                        exit={{ scaleX: 0, opacity: 0 }}
                        transition={{
                          type: "spring",
                          stiffness: 300,
                          damping: 25,
                        }}
                        className="absolute -bottom-2 h-1.5 w-1.5 rounded-full bg-primary"
                      />
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Status message */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStatus}
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="mt-2 rounded-xl border bg-card/50 p-6 text-center shadow-sm"
        >
          <motion.div
            className="mb-2 text-4xl"
            animate={{
              rotate: [0, -10, 10, -10, 0],
              scale: [1, 1.2, 1],
            }}
            transition={{ duration: 0.6 }}
          >
            {currentStatusData.emoji}
          </motion.div>
          <h3 className="mb-1 text-lg font-bold text-foreground">
            {currentStatusData.message}
          </h3>
          <p className="text-sm text-muted-foreground">
            {currentStatusData.subMessage}
          </p>
          <div className="mt-3 text-xs text-muted-foreground/50">
            Estado Actual: {currentStatusData.label}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
