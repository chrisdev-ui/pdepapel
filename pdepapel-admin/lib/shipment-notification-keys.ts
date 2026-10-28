import type { NotificationChannel } from "@prisma/client";

import type { ShipmentMilestone } from "@/lib/shipment-milestones";

/**
 * Las piezas puras de los avisos de envío, sin base de datos: las usan el
 * notificador y los guiones de respaldo (que corren fuera de Next).
 */
export const SILENT_NOTICE_REASON = "Cambio de estado sin avisar";

export function buildDedupeKey(input: { shippingId: string; milestone: ShipmentMilestone; trackingCode: string | null; channel: NotificationChannel; role: string; suffix?: string }): string {
  const tracking = (input.trackingCode ?? "-").replace(/\s+/g, "").slice(0, 60);
  return [input.shippingId, input.milestone, tracking, input.channel, input.role, input.suffix].filter(Boolean).join(":").slice(0, 191);
}
