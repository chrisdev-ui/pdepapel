"use client";

import { statusOptions } from "@/constants";
import { cn } from "@/lib/utils";
import { OrderStatus as DbStatus } from "@prisma/enums";
import { Check, CheckCircle2, Clock, Package, XCircle } from "lucide-react";

export type OrderStatus = DbStatus;

interface OrderStatusSelectorProps {
  currentStatus: OrderStatus;
  onStatusChange?: (status: OrderStatus) => void;
  readOnly?: boolean;
  className?: string;
  labels?: Record<OrderStatus, string>;
}

const statusConfig = {
  CREATED: {
    label: statusOptions.CREATED,
    icon: Clock,
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    activeColor: "text-accent",
    activeBgColor: "bg-accent/10",
    description: "Orden registrada",
  },
  PENDING: {
    label: statusOptions.PENDING,
    icon: Package,
    color: "text-warning",
    bgColor: "bg-warning/10",
    activeColor: "text-warning",
    activeBgColor: "bg-warning/20",
    description: "Procesando pago",
  },
  PAID: {
    label: statusOptions.PAID,
    icon: CheckCircle2,
    color: "text-success",
    bgColor: "bg-success/10",
    activeColor: "text-success",
    activeBgColor: "bg-success/20",
    description: "Pago confirmado",
  },
  CANCELLED: {
    label: statusOptions.CANCELLED,
    icon: XCircle,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
    activeColor: "text-destructive",
    activeBgColor: "bg-destructive/20",
    description: "Orden cancelada",
  },
};

const statusOrder: OrderStatus[] = Object.values(DbStatus).map(
  (status) => status,
);

export function OrderStatusSelector({
  currentStatus,
  onStatusChange,
  readOnly = false,
  className,
  labels,
}: OrderStatusSelectorProps) {
  const currentIndex = statusOrder.indexOf(currentStatus);

  const handleStatusClick = (status: OrderStatus) => {
    if (!readOnly && onStatusChange) {
      onStatusChange(status);
    }
  };

  const getLabel = (status: OrderStatus) => {
    return labels?.[status] || statusConfig[status].label;
  };

  return (
    <div className={cn("w-full", className)}>
      {/* Mobile View - Vertical */}
      <div className="space-y-4 md:hidden">
        {statusOrder.map((status, index) => {
          const config = statusConfig[status];
          const Icon = config.icon;
          const isActive = status === currentStatus;
          const isCompleted =
            status !== "CANCELLED" &&
            index < currentIndex &&
            currentStatus !== "CANCELLED";
          const isClickable = !readOnly;

          return (
            <div key={status} className="relative">
              <div
                onClick={() => isClickable && handleStatusClick(status)}
                className={cn(
                  "flex h-auto w-full items-start gap-4 rounded-xl p-4 transition-all duration-300",
                  isActive && "bg-card shadow-lg ring-2 ring-ring/10",
                  !isActive && isClickable && "hover:bg-muted/50",
                  isClickable && "cursor-pointer",
                  !isClickable && "cursor-not-allowed opacity-50",
                )}
              >
                <div
                  className={cn(
                    "flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full transition-all duration-300",
                    isCompleted && "bg-primary text-primary-foreground",
                    isActive && !isCompleted && config.activeBgColor,
                    !isActive && !isCompleted && config.bgColor,
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-6 w-6" />
                  ) : (
                    <Icon
                      className={cn(
                        "h-6 w-6 transition-colors duration-300",
                        isActive ? config.activeColor : config.color,
                      )}
                    />
                  )}
                </div>
                <div className="flex-1 text-left">
                  <div
                    className={cn(
                      "text-base font-semibold transition-colors duration-300",
                      isActive || isCompleted
                        ? "text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {getLabel(status)}
                  </div>
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    {config.description}
                  </div>
                </div>
              </div>
              {index < statusOrder.length - 1 && (
                <div
                  className={cn(
                    "absolute left-10 top-[72px] h-4 w-0.5 transition-colors duration-300",
                    isCompleted ? "bg-primary" : "bg-border",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop View - Horizontal */}
      <div className="hidden md:block">
        <div className="relative">
          {/* Progress Line */}
          <div className="absolute left-0 right-0 top-12 h-0.5 bg-border">
            <div
              className="h-full bg-primary transition-all duration-500 ease-out"
              style={{
                width:
                  currentStatus === "CANCELLED"
                    ? "0%"
                    : `${(currentIndex / (statusOrder.length - 2)) * 100}%`,
              }}
            />
          </div>

          {/* Status Steps */}
          <div className="relative grid grid-cols-4 gap-4">
            {statusOrder.map((status, index) => {
              const config = statusConfig[status];
              const Icon = config.icon;
              const isActive = status === currentStatus;
              const isCompleted =
                status !== "CANCELLED" &&
                index < currentIndex &&
                currentStatus !== "CANCELLED";
              const isClickable = !readOnly;

              return (
                <div key={status} className="flex flex-col items-center">
                  <div
                    onClick={() => isClickable && handleStatusClick(status)}
                    className={cn(
                      "flex h-auto w-full flex-col items-center gap-3 rounded-xl p-4 transition-all duration-300",
                      isActive && "bg-card shadow-lg ring-2 ring-ring/10",
                      !isActive && isClickable && "hover:bg-muted/50",
                      isClickable && "cursor-pointer",
                      !isClickable && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <div
                      className={cn(
                        "relative z-10 flex h-16 w-16 items-center justify-center rounded-full transition-all duration-300",
                        isCompleted &&
                          "bg-primary text-primary-foreground shadow-lg",
                        isActive && !isCompleted && config.activeBgColor,
                        !isActive && !isCompleted && config.bgColor,
                      )}
                    >
                      {isCompleted ? (
                        <Check className="h-7 w-7" />
                      ) : (
                        <Icon
                          className={cn(
                            "h-7 w-7 transition-colors duration-300",
                            isActive ? config.activeColor : config.color,
                          )}
                        />
                      )}
                    </div>
                    <div className="space-y-1 text-center">
                      <div
                        className={cn(
                          "text-base font-semibold transition-colors duration-300",
                          isActive || isCompleted
                            ? "text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {getLabel(status)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {config.description}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
