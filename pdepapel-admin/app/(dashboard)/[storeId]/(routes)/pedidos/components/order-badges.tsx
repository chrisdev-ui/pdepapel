import { TintBadge } from "@/components/ui/tint-badge";

/** La insignia vive en `components/ui/tint-badge`; se reexporta para los importadores existentes. */
export { TintBadge };

export const CHANNEL_TONE: Record<string, string> = {
  tienda: "sky",
  presencial: "pink",
  feria: "lavender",
  cotizacion: "lavender",
  personalizado: "cream",
};
