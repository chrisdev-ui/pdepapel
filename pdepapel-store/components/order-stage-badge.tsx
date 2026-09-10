import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  HandCoins,
  PackageCheck,
  Truck,
  type LucideIcon,
} from "lucide-react";

import type { OrderStageInfo, StageTone } from "@/lib/order-status";
import { cn } from "@/lib/utils";

const TONE_CLASSES: Record<StageTone, string> = {
  warning: "bg-kawaii-yellow-light text-yellow-900",
  info: "bg-kawaii-blue-light text-sky-900",
  success: "bg-kawaii-mint-light text-emerald-900",
  danger: "bg-pink-shell/40 text-rose-900",
  neutral: "bg-muted text-muted-foreground",
};

const STAGE_ICONS: Record<OrderStageInfo["stage"], LucideIcon> = {
  unpaid: Clock,
  verifying: Clock,
  cod: HandCoins,
  paid: CheckCircle2,
  shipped: Truck,
  delivered: PackageCheck,
  issue: AlertTriangle,
  cancelled: Ban,
};

interface OrderStageBadgeProps {
  stage: OrderStageInfo;
  size?: "sm" | "md";
  className?: string;
}

/** Status chip shared by the order detail and the order history. */
export function OrderStageBadge({
  stage,
  size = "md",
  className,
}: OrderStageBadgeProps) {
  const Icon = STAGE_ICONS[stage.stage];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-sans font-bold",
        size === "md" ? "h-7 px-3 text-xs" : "h-6 px-2.5 text-[11px]",
        TONE_CLASSES[stage.tone],
        className,
      )}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      {stage.label}
    </span>
  );
}
