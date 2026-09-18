"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { TintBadge } from "@/components/ui/tint-badge";
import { shippingOptions } from "@/constants";
import { getCarrierInfo } from "@/constants/shipping";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { currencyFormatter } from "@/lib/utils";
import { ShippingStatus } from "@prisma/client";
import axios from "axios";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Calendar,
  Download,
  ExternalLink,
  Package,
  RefreshCw,
  XCircle,
} from "lucide-react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "./order-form/confirm-dialog";

interface ShippingData {
  id: string;
  provider: string;
  status: ShippingStatus;
  carrierName?: string | null;
  trackingCode?: string | null;
  trackingUrl?: string | null;
  guideUrl?: string | null;
  cost?: number | null;
  courier?: string | null;
  envioClickIdRate?: number | null;
  envioClickIdOrder?: number | null;
  estimatedDeliveryDate?: Date | null;
  actualDeliveryDate?: Date | null;
  productName?: string | null;
  flete?: number | null;
  minimumInsurance?: number | null;
  deliveryDays?: number | null;
  isCOD?: boolean;
}

interface ShippingInfoProps {
  shipping?: ShippingData | null;
  /** The order reached the store free-shipping threshold (or saved a zero-charge quote). */
  freeShipping?: boolean;
}

/** Mismo tinte que la insignia de envío de la lista. */
const STATUS_TONE: Record<ShippingStatus, string> = {
  Preparing: "lavender",
  Shipped: "sky",
  PickedUp: "sky",
  InTransit: "sky",
  OutForDelivery: "sky",
  Delivered: "mint",
  FailedDelivery: "pink",
  Returned: "pink",
  Cancelled: "slate",
  Exception: "pink",
};

const CLOSED: ShippingStatus[] = [
  ShippingStatus.Delivered,
  ShippingStatus.Cancelled,
  ShippingStatus.Returned,
];

/**
 * Estado real del envío: guía, seguimiento, fechas y costo. Solo lectura
 * salvo actualizar el rastreo y cancelar la guía; crearla vive en la sección
 * de envío, con un único botón.
 */
export const ShippingInfo: React.FC<ShippingInfoProps> = ({
  shipping,
  freeShipping = false,
}) => {
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const [tracking, setTracking] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  if (!shipping) return null;

  const hasGuide = Boolean(shipping.envioClickIdOrder);
  const carrierInfo = shipping.carrierName
    ? getCarrierInfo(shipping.carrierName)
    : shipping.courier
      ? getCarrierInfo(shipping.courier)
      : null;
  const canCancel = hasGuide && !CLOSED.includes(shipping.status);

  const trackShipment = async () => {
    setTracking(true);
    try {
      await axios.post(`/api/${params.storeId}/shipment/track`, {
        shippingId: shipping.id,
      });
      toast({ description: "Seguimiento actualizado", variant: "success" });
      router.refresh();
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setTracking(false);
    }
  };

  const cancelShipment = async () => {
    setCancelling(true);
    try {
      await axios.post(`/api/${params.storeId}/shipment/cancel`, {
        shippingId: shipping.id,
      });
      toast({ description: "Envío cancelado", variant: "success" });
      setCancelOpen(false);
      router.refresh();
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div
      id="envio-estado"
      className="flex scroll-mt-24 flex-col gap-4 rounded-lg border bg-white p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-primary">
          <Package className="h-4 w-4" aria-hidden="true" />
          Estado del envío
        </h3>
        <TintBadge
          label={shippingOptions[shipping.status]}
          tone={STATUS_TONE[shipping.status] ?? "slate"}
        />
      </div>

      <div className="flex items-center gap-4">
        {carrierInfo && (
          <div
            className="flex h-14 w-20 flex-shrink-0 items-center justify-center rounded-md p-2"
            style={{ backgroundColor: carrierInfo.color || "#FFFFFF" }}
          >
            <Image
              src={carrierInfo.logoUrl}
              alt={carrierInfo.comercialName}
              width={72}
              height={40}
              className="h-full w-full object-contain"
              unoptimized
            />
          </div>
        )}
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">
              Transportadora
            </span>
            <span className="text-sm font-medium">
              {shipping.carrierName || "No especificada"}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Proveedor</span>
            <span className="text-sm font-medium">{shipping.provider}</span>
          </div>
        </div>
      </div>

      {shipping.envioClickIdRate && (
        <>
          <Separator />
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3 sm:grid-cols-4">
            {shipping.productName && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">Servicio</span>
                <span className="text-sm font-medium">
                  {shipping.productName}
                </span>
              </div>
            )}
            {shipping.deliveryDays !== null &&
              shipping.deliveryDays !== undefined && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Entrega</span>
                  <span className="text-sm font-medium">
                    {shipping.deliveryDays}{" "}
                    {shipping.deliveryDays === 1 ? "día" : "días"}
                  </span>
                </div>
              )}
            {shipping.flete !== null && shipping.flete !== undefined && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">
                  Flete base
                </span>
                <span className="text-sm font-medium">
                  {currencyFormatter(shipping.flete)}
                </span>
              </div>
            )}
            {shipping.minimumInsurance !== null &&
              shipping.minimumInsurance !== undefined && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">
                    Seguro mínimo
                  </span>
                  <span className="text-sm font-medium">
                    {currencyFormatter(shipping.minimumInsurance)}
                  </span>
                </div>
              )}
            {shipping.isCOD && (
              <div className="col-span-2 sm:col-span-4">
                <TintBadge label="Pago contra entrega" tone="mint" />
              </div>
            )}
          </div>
        </>
      )}

      {shipping.trackingCode && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            Número de seguimiento
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <span className="break-all font-mono text-sm font-medium">
              {shipping.trackingCode}
            </span>
            {shipping.trackingUrl && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Abrir seguimiento"
                onClick={() => window.open(shipping.trackingUrl!, "_blank")}
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={trackShipment}
              disabled={tracking}
              aria-label="Actualizar rastreo"
            >
              <RefreshCw
                className={`h-4 w-4 ${tracking ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
            </Button>
          </div>
        </div>
      )}

      {(shipping.estimatedDeliveryDate || shipping.actualDeliveryDate) && (
        <>
          <Separator />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {shipping.estimatedDeliveryDate && (
              <div className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" aria-hidden="true" />
                  Entrega estimada
                </span>
                <span className="text-sm font-medium">
                  {format(new Date(shipping.estimatedDeliveryDate), "PPP", {
                    locale: es,
                  })}
                </span>
              </div>
            )}
            {shipping.actualDeliveryDate && (
              <div className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" aria-hidden="true" />
                  Entrega real
                </span>
                <span className="text-sm font-medium">
                  {format(new Date(shipping.actualDeliveryDate), "PPP", {
                    locale: es,
                  })}
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {(freeShipping ||
        (shipping.cost !== null && shipping.cost !== undefined)) && (
        <>
          <Separator />
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              Costo de envío
            </span>
            {freeShipping ? (
              <div className="flex items-center gap-2">
                <Badge variant="success">Gratis</Badge>
                <span className="text-xs text-muted-foreground">
                  El pedido alcanzó el monto de envío gratis; el flete lo asume
                  la tienda.
                </span>
              </div>
            ) : (
              <span className="text-lg font-bold">
                {currencyFormatter(shipping.cost ?? 0)}
              </span>
            )}
          </div>
        </>
      )}

      {hasGuide &&
        shipping.guideUrl &&
        shipping.status !== ShippingStatus.Cancelled && (
          <>
            <Separator />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                onClick={() => window.open(shipping.guideUrl!, "_blank")}
                variant="outline"
                className="flex-1"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Descargar guía (PDF)
              </Button>
              {canCancel && (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setCancelOpen(true)}
                  disabled={cancelling}
                >
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                  Cancelar envío
                </Button>
              )}
            </div>
          </>
        )}

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancelar el envío"
        from={{
          label: shippingOptions[shipping.status],
          tone: STATUS_TONE[shipping.status] ?? "slate",
        }}
        to={{ label: "Envío cancelado", tone: "slate" }}
        meta={shipping.carrierName ?? undefined}
        consequences={[
          "Se anula la guía con la transportadora.",
          "La transportadora puede cobrar por la cancelación.",
          "No se puede deshacer: habría que cotizar y crear otra guía.",
        ]}
        confirmLabel="Sí, cancelar envío"
        destructive
        loading={cancelling}
        onConfirm={cancelShipment}
      />
    </div>
  );
};
