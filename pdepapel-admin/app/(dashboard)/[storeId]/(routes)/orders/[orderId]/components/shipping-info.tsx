"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { shippingOptions } from "@/constants";
import { getCarrierInfo } from "@/constants/shipping";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { currencyFormatter } from "@/lib/utils";
import { ShippingStatus } from "@prisma/enums";
import axios from "axios";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertCircle,
  Calendar,
  Check,
  Download,
  ExternalLink,
  Package,
  PackageCheck,
  PackageOpen,
  PackageX,
  RefreshCw,
  Trash2,
  Truck,
  XCircle,
} from "lucide-react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useReducer } from "react";

// --- Types ---

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
  orderStatus: string;
}

interface ShippingState {
  loadingAction:
    | "create-guide"
    | "delete-rate"
    | "cancel-shipment"
    | "track-shipment"
    | null;
  activeModal: "delete-rate" | "cancel-shipment" | null;
}

type ShippingAction =
  | { type: "OPEN_MODAL"; payload: "delete-rate" | "cancel-shipment" }
  | { type: "CLOSE_MODAL" }
  | {
      type: "START_ACTION";
      payload:
        | "create-guide"
        | "delete-rate"
        | "cancel-shipment"
        | "track-shipment";
    }
  | { type: "ACTION_SUCCESS" }
  | { type: "ACTION_FAILURE" };

// --- Reducer ---

const initialState: ShippingState = {
  loadingAction: null,
  activeModal: null,
};

const shippingReducer = (
  state: ShippingState,
  action: ShippingAction,
): ShippingState => {
  switch (action.type) {
    case "OPEN_MODAL":
      return { ...state, activeModal: action.payload };

    case "CLOSE_MODAL":
      return { ...state, activeModal: null };

    case "START_ACTION":
      return { ...state, loadingAction: action.payload };

    case "ACTION_SUCCESS":
      return {
        ...state,
        loadingAction: null,
        activeModal: null,
      };

    case "ACTION_FAILURE":
      return {
        ...state,
        loadingAction: null,
      };

    default:
      return state;
  }
};

// --- Helper ---

const getStatusConfig = (status: ShippingStatus) => {
  switch (status) {
    case ShippingStatus.Preparing:
      return {
        icon: PackageOpen,
        color: "bg-blue-100 text-blue-800 border-blue-200",
        animation: "animate-pulse",
      };
    case ShippingStatus.Shipped:
    case ShippingStatus.PickedUp:
      return {
        icon: PackageCheck,
        color: "bg-purple-100 text-purple-800 border-purple-200",
        animation: "animate-in fade-in slide-in-from-top-2 duration-1000",
      };
    case ShippingStatus.InTransit:
    case ShippingStatus.OutForDelivery:
      return {
        icon: Truck,
        color: "bg-yellow-100 text-yellow-800 border-yellow-200",
        animation: "animate-pulse",
      };
    case ShippingStatus.Delivered:
      return {
        icon: Check,
        color: "bg-green-100 text-green-800 border-green-200",
        animation: "",
      };
    case ShippingStatus.FailedDelivery:
    case ShippingStatus.Returned:
      return {
        icon: PackageX,
        color: "bg-red-100 text-red-800 border-red-200",
        animation: "",
      };
    case ShippingStatus.Cancelled:
    case ShippingStatus.Exception:
      return {
        icon: AlertCircle,
        color: "bg-gray-100 text-gray-800 border-gray-200",
        animation: "",
      };
    default:
      return {
        icon: Package,
        color: "bg-gray-100 text-gray-800 border-gray-200",
        animation: "",
      };
  }
};

// --- Component ---

export const ShippingInfo: React.FC<ShippingInfoProps> = ({
  shipping,
  orderStatus,
}) => {
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const [state, dispatch] = useReducer(shippingReducer, {
    ...initialState,
  });

  const { loadingAction, activeModal } = state;

  const hasGuide = !!shipping?.envioClickIdOrder;
  const hasRateWithoutGuide = !!shipping?.envioClickIdRate && !hasGuide;
  const canCreateGuide = hasRateWithoutGuide && orderStatus === "PAID";
  const carrierInfo = shipping?.carrierName
    ? getCarrierInfo(shipping.carrierName)
    : shipping?.courier
      ? getCarrierInfo(shipping.courier)
      : null;
  const bgColor = carrierInfo?.color || "#FFFFFF";
  const statusConfig = shipping ? getStatusConfig(shipping.status) : null;

  const canCancel =
    shipping &&
    hasGuide &&
    !(
      [
        ShippingStatus.Delivered,
        ShippingStatus.Cancelled,
        ShippingStatus.Returned,
      ] as ShippingStatus[]
    ).includes(shipping.status);

  const handleCreateGuide = async () => {
    try {
      dispatch({ type: "START_ACTION", payload: "create-guide" });

      const response = await axios.post(
        `/api/${params.storeId}/orders/${params.orderId}/shipping/create-guide`,
      );

      toast({
        description: "Guía creada exitosamente",
        variant: "success",
      });

      dispatch({ type: "ACTION_SUCCESS" });

      router.refresh();
    } catch (error) {
      dispatch({ type: "ACTION_FAILURE" });
      toast({
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const handleDeleteRate = async () => {
    dispatch({ type: "START_ACTION", payload: "delete-rate" });

    try {
      await axios.delete(
        `/api/${params.storeId}/orders/${params.orderId}/shipping/clear-rate`,
      );

      toast({
        description: "Cotización eliminada exitosamente",
        variant: "success",
      });

      dispatch({ type: "ACTION_SUCCESS" });

      router.refresh();
    } catch (error) {
      dispatch({ type: "ACTION_FAILURE" });
      toast({
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const handleCancelShipment = async () => {
    if (!shipping) return;

    dispatch({ type: "START_ACTION", payload: "cancel-shipment" });

    try {
      await axios.post(`/api/${params.storeId}/shipment/cancel`, {
        shippingId: shipping.id,
      });

      toast({
        description: "Envío cancelado exitosamente",
        variant: "success",
      });

      dispatch({ type: "ACTION_SUCCESS" });
      router.refresh();
    } catch (error) {
      dispatch({ type: "ACTION_FAILURE" });
      toast({
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const handleTrackShipment = async () => {
    if (!shipping) return;
    try {
      dispatch({ type: "START_ACTION", payload: "track-shipment" });

      const response = await axios.post(
        `/api/${params.storeId}/shipment/track`,
        {
          shippingId: shipping.id,
        },
      );

      toast({
        description: "Información de rastreo actualizada",
        variant: "success",
      });

      dispatch({ type: "ACTION_SUCCESS" });
      router.refresh();
    } catch (error) {
      dispatch({ type: "ACTION_FAILURE" });
      toast({
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  if (!shipping) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Información de Envío
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              No hay información de envío. Usa el formulario de arriba para
              cotizar y crear un envío.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Información de Envío
          </CardTitle>
          {statusConfig && (
            <div
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${statusConfig.color}`}
            >
              <statusConfig.icon
                className={`h-4 w-4 ${statusConfig.animation}`}
              />
              {shippingOptions[shipping.status]}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Carrier Info with Logo */}
        <div className="flex items-center gap-4">
          {carrierInfo && (
            <div
              className="flex h-16 w-24 flex-shrink-0 items-center justify-center rounded-md p-2"
              style={{ backgroundColor: bgColor }}
            >
              <Image
                src={carrierInfo.logoUrl}
                alt={carrierInfo.comercialName}
                width={80}
                height={48}
                className="h-full w-full object-contain"
              />
            </div>
          )}

          <div className="flex-1 space-y-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Transportadora</p>
                <p className="font-medium">
                  {shipping.carrierName || "No especificada"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Proveedor</p>
                <p className="font-medium">{shipping.provider}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quotation Details */}
        {shipping.envioClickIdRate && (
          <>
            <Separator />
            <div className="space-y-3 rounded-lg bg-muted/50 p-4">
              <p className="text-sm font-semibold">Detalles de Cotización</p>
              <div className="grid grid-cols-2 gap-4">
                {shipping.productName && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Tipo de producto
                    </p>
                    <p className="text-sm font-medium">
                      {shipping.productName}
                    </p>
                  </div>
                )}
                {shipping.deliveryDays !== null &&
                  shipping.deliveryDays !== undefined && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        Días de entrega
                      </p>
                      <p className="text-sm font-medium">
                        {shipping.deliveryDays}{" "}
                        {shipping.deliveryDays === 1 ? "día" : "días"}
                      </p>
                    </div>
                  )}
                {shipping.flete !== null && shipping.flete !== undefined && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Flete base</p>
                    <p className="text-sm font-medium">
                      {currencyFormatter(shipping.flete)}
                    </p>
                  </div>
                )}
                {shipping.minimumInsurance !== null &&
                  shipping.minimumInsurance !== undefined && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        Seguro mínimo
                      </p>
                      <p className="text-sm font-medium">
                        {currencyFormatter(shipping.minimumInsurance)}
                      </p>
                    </div>
                  )}
                {shipping.isCOD && (
                  <div className="col-span-2 space-y-1">
                    <Badge variant="secondary" className="text-xs">
                      Pago contra entrega (COD)
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Tracking */}
        {shipping.trackingCode && (
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Número de seguimiento
            </p>
            <div className="flex items-center gap-2">
              <p className="font-mono font-medium">{shipping.trackingCode}</p>
              {shipping.trackingUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(shipping.trackingUrl!, "_blank")}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleTrackShipment}
                disabled={loadingAction === "track-shipment"}
                title="Actualizar rastreo"
              >
                <RefreshCw
                  className={`h-4 w-4 ${loadingAction === "track-shipment" ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
          </div>
        )}

        {/* Dates */}
        {(shipping.estimatedDeliveryDate || shipping.actualDeliveryDate) && (
          <>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              {shipping.estimatedDeliveryDate && (
                <div className="space-y-1">
                  <p className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    Entrega estimada
                  </p>
                  <p className="text-sm font-medium">
                    {format(new Date(shipping.estimatedDeliveryDate), "PPP", {
                      locale: es,
                    })}
                  </p>
                </div>
              )}
              {shipping.actualDeliveryDate && (
                <div className="space-y-1">
                  <p className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    Entrega real
                  </p>
                  <p className="text-sm font-medium">
                    {format(new Date(shipping.actualDeliveryDate), "PPP", {
                      locale: es,
                    })}
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Cost */}
        {shipping.cost && (
          <>
            <Separator />
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Costo de envío</p>
              <p className="text-lg font-bold">
                {currencyFormatter(shipping.cost)}
              </p>
            </div>
          </>
        )}

        {/* Guide Download */}
        {hasGuide && shipping.guideUrl && (
          <>
            <Separator />
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => window.open(shipping.guideUrl!, "_blank")}
                variant="outline"
                className="w-full"
              >
                <Download className="mr-2 h-4 w-4" />
                Descargar Guía de Envío (PDF)
              </Button>

              {canCancel && (
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() =>
                    dispatch({
                      type: "OPEN_MODAL",
                      payload: "cancel-shipment",
                    })
                  }
                  disabled={loadingAction === "cancel-shipment"}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Cancelar Envío
                </Button>
              )}
            </div>
          </>
        )}

        {/* Warning if no guide yet */}
        {hasRateWithoutGuide && (
          <>
            <Alert>
              <AlertDescription className="space-y-3">
                <p>
                  Esta orden tiene una cotización pero aún no se ha creado la
                  guía de envío.
                  {canCreateGuide
                    ? " Puedes crear la guía manualmente desde aquí."
                    : " Edita la orden y guárdala como PAGADA para crear la guía automáticamente."}
                </p>
                <p className="text-xs text-muted-foreground">
                  Si la cotización ha expirado (más de 2 horas), elimínala para
                  obtener una nueva con tarifas actualizadas.
                </p>
              </AlertDescription>
            </Alert>
            <div className="grid grid-cols-2 gap-3">
              {canCreateGuide && (
                <Button
                  size="sm"
                  className="w-full"
                  onClick={handleCreateGuide}
                  disabled={
                    loadingAction === "create-guide" ||
                    loadingAction === "delete-rate"
                  }
                >
                  {loadingAction === "create-guide" ? (
                    <>
                      <Package className="mr-2 h-4 w-4 animate-spin" />
                      Creando...
                    </>
                  ) : (
                    <>
                      <Package className="mr-2 h-4 w-4" />
                      Crear Guía Ahora
                    </>
                  )}
                </Button>
              )}
              <Button
                variant="destructive"
                size="sm"
                className={canCreateGuide ? "w-full" : "col-span-2 w-full"}
                onClick={() =>
                  dispatch({ type: "OPEN_MODAL", payload: "delete-rate" })
                }
                disabled={
                  loadingAction === "delete-rate" ||
                  loadingAction === "create-guide"
                }
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar Cotización Expirada
              </Button>
            </div>
          </>
        )}
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={activeModal === "delete-rate"}
        onOpenChange={(open) => !open && dispatch({ type: "CLOSE_MODAL" })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cotización de envío?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Esta acción eliminará la cotización actual del envío. Después
                podrás:
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Solicitar una nueva cotización con tarifas actualizadas</li>
                <li>Seleccionar la mejor opción de envío disponible</li>
              </ul>
              <p className="mt-3 font-semibold text-destructive">
                Solo puedes hacer esto si aún no se ha creado la guía de envío.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={loadingAction === "delete-rate"}
              onClick={() => dispatch({ type: "CLOSE_MODAL" })}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRate}
              disabled={loadingAction === "delete-rate"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loadingAction === "delete-rate"
                ? "Eliminando..."
                : "Eliminar Cotización"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Shipment Dialog */}
      <AlertDialog
        open={activeModal === "cancel-shipment"}
        onOpenChange={(open) => !open && dispatch({ type: "CLOSE_MODAL" })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar envío?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Esta acción cancelará el envío con la transportadora. Ten en
                cuenta que:
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>La guía de envío será anulada.</li>
                <li>
                  Es posible que se apliquen cargos por cancelación dependiendo
                  de la transportadora.
                </li>
                <li>Esta acción no se puede deshacer.</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={loadingAction === "cancel-shipment"}
              onClick={() => dispatch({ type: "CLOSE_MODAL" })}
            >
              Volver
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelShipment}
              disabled={loadingAction === "cancel-shipment"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loadingAction === "cancel-shipment"
                ? "Cancelando..."
                : "Sí, Cancelar Envío"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
