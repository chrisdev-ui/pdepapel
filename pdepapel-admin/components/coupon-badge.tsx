"use client";

import { Badge, BadgeProps } from "@/components/ui/badge";
import { getTimeStatus } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { CalendarClock, Clock, Tag, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface CouponBadgeProps {
  code: string;
  startDate: Date;
  endDate: Date;
  type?: BadgeProps["variant"];
  className?: string;
}

type CouponStatus = "pending" | "active" | "expired";

interface StatusConfig {
  icon: JSX.Element;
  text: string;
  opacity: string;
}

export interface TimeStatus {
  status: CouponStatus;
  timeRemaining: string | null;
}

export const CouponBadge: React.FC<CouponBadgeProps> = ({
  code,
  startDate,
  endDate,
  type = "default",
  className,
}) => {
  const [timeStatus, setTimeStatus] = useState<TimeStatus>(() =>
    getTimeStatus(startDate, endDate),
  );

  const statusConfig = useMemo<Record<CouponStatus, StatusConfig>>(
    () => ({
      pending: {
        icon: <Tag className="h-3.5 w-3.5" />,
        text: "Por iniciar",
        opacity: "opacity-70",
      },
      active: {
        icon: <Tag className="h-3.5 w-3.5" />,
        text: "Activo",
        opacity: "",
      },
      expired: {
        icon: <X className="h-3.5 w-3.5" />,
        text: "Expirado",
        opacity: "opacity-60",
      },
    }),
    [],
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeStatus(getTimeStatus(startDate, endDate));
    }, 60000);

    return () => clearInterval(timer);
  }, [startDate, endDate]);

  const config = statusConfig[timeStatus.status];

  return (
    <Badge
      variant={type}
      className={cn(
        "flex items-center justify-between px-3 py-1.5 text-sm font-medium transition-colors",
        config.opacity,
        className,
      )}
    >
      {config.icon}
      <span className="font-mono uppercase">{code}</span>
      {timeStatus.timeRemaining && (
        <div className="opacity-85 flex items-center gap-1 text-xs">
          {timeStatus.status === "active" && <Clock className="h-3 w-3" />}
          {timeStatus.status === "pending" && (
            <CalendarClock className="h-3 w-3" />
          )}
          {timeStatus.timeRemaining}
          <span className="sr-only">{config.text}</span>
        </div>
      )}
    </Badge>
  );
};
