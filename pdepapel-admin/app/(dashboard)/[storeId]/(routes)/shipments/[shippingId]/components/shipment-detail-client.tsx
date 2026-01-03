"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTableCellPhone } from "@/components/ui/data-table-cell-phone";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { Models } from "@/constants";
import { getCarrierInfo } from "@/constants/shipping";
import { useToast } from "@/hooks/use-toast";
import { currencyFormatter } from "@/lib/utils";
import type { Prisma } from "@prisma/client";
import { ShippingProvider, ShippingStatus } from "@prisma/enums";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft,
  Calendar,
  ExternalLink,
  MapPin,
  Package,
  RefreshCw,
  TruckIcon,
  User,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

type ShipmentWithOrder = Prisma.ShippingGetPayload<{
  include: {
    order: {
      include: {
        orderItems: {
          include: {
            product: {
              select: {
                id: true;
                name: true;
                images: true;
              };
            };
          };
        };
        payment: true;
      };
    };
  };
}>;

interface ShipmentDetailClientProps {
  shipment: ShipmentWithOrder;
}

const STATUS_VARIANTS: Record<
  ShippingStatus,
  {
    variant: "outline" | "secondary" | "success" | "destructive";
    label: string;
  }
> = {
  [ShippingStatus.Preparing]: { variant: "outline", label: "📦 Preparando" },
  [ShippingStatus.Shipped]: { variant: "secondary", label: "🚀 Despachada" },
  [ShippingStatus.PickedUp]: { variant: "secondary", label: "📮 Recogido" },
  [ShippingStatus.InTransit]: { variant: "secondary", label: "⛟ En tránsito" },
  [ShippingStatus.OutForDelivery]: {
    variant: "secondary",
    label: "🚚 En reparto",
  },
  [ShippingStatus.Delivered]: { variant: "success", label: "🏠 Entregado" },
  [ShippingStatus.FailedDelivery]: {
    variant: "destructive",
    label: "❌ Entrega fallida",
  },
  [ShippingStatus.Returned]: { variant: "destructive", label: "🔙 Retornado" },
  [ShippingStatus.Cancelled]: { variant: "destructive", label: "🚫 Cancelado" },
  [ShippingStatus.Exception]: {
    variant: "destructive",
    label: "⚠️ Incidencia",
  },
};

export function ShipmentDetailClient({ shipment }: ShipmentDetailClientProps) {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const [updating, setUpdating] = useState(false);

  const carrierName = shipment.carrierName || shipment.courier;
  const carrierInfo = carrierName ? getCarrierInfo(carrierName) : null;

  const handleUpdateTracking = async () => {
    try {
      setUpdating(true);
      const response = await fetch(
        `/api/${params.storeId}/${Models.Shipments}/${shipment.id}/update-tracking`,
        { method: "POST" },
      );

      if (!response.ok) throw new Error("Error al actualizar rastreo");

      toast({
        title: "Rastreo actualizado",
        description: "La información de rastreo se ha actualizado",
      });

      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo actualizar el rastreo",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              router.push(`/${params.storeId}/${Models.Shipments}`)
            }
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Heading
            title={`Envío #${shipment.trackingCode || shipment.id.slice(0, 8)}`}
            description="Detalles del envío"
          />
        </div>

        <div className="flex gap-2">
          {shipment.provider === ShippingProvider.ENVIOCLICK &&
            shipment.envioClickIdOrder && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleUpdateTracking}
                disabled={updating}
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${updating ? "animate-spin" : ""}`}
                />
                {updating ? "Actualizando..." : "Actualizar Rastreo"}
              </Button>
            )}
          {shipment.guideUrl && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(shipment.guideUrl!, "_blank")}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Ver Guía PDF
            </Button>
          )}
        </div>
      </div>

      <Separator />

      <div className="grid gap-4 md:grid-cols-2">
        {/* Shipping Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Estado del Envío
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-2 text-sm text-muted-foreground">
                Estado actual
              </p>
              <Badge
                variant={STATUS_VARIANTS[shipment.status].variant}
                className="text-base"
              >
                {STATUS_VARIANTS[shipment.status].label}
              </Badge>
            </div>

            {shipment.trackingCode && (
              <div>
                <p className="mb-1 text-sm text-muted-foreground">
                  Código de rastreo
                </p>
                <code className="font-mono text-lg font-bold">
                  {shipment.trackingCode}
                </code>
              </div>
            )}

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="mb-1 text-sm text-muted-foreground">Proveedor</p>
                <p className="font-medium">{shipment.provider}</p>
              </div>
              {shipment.cost && (
                <div>
                  <p className="mb-1 text-sm text-muted-foreground">Costo</p>
                  <p className="font-medium">
                    {currencyFormatter(shipment.cost)}
                  </p>
                </div>
              )}
            </div>

            {shipment.estimatedDeliveryDate && (
              <div>
                <p className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  Fecha estimada de entrega
                </p>
                <p className="font-medium">
                  {format(new Date(shipment.estimatedDeliveryDate), "PPP", {
                    locale: es,
                  })}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Carrier Info Card */}
        {carrierInfo && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TruckIcon className="h-5 w-5" />
                Transportadora
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div
                  className="flex h-20 w-32 items-center justify-center rounded-md p-4"
                  style={{ backgroundColor: carrierInfo.color }}
                >
                  <Image
                    src={carrierInfo.logoUrl}
                    alt={carrierInfo.comercialName}
                    width={96}
                    height={48}
                    className="h-full w-full object-contain"
                  />
                </div>
                <div>
                  <p className="text-lg font-bold">
                    {carrierInfo.comercialName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {carrierInfo.code}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Order Info Card */}
        {shipment.order && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Información del Pedido
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="mb-1 text-sm text-muted-foreground">
                    Número de orden
                  </p>
                  <Link
                    href={`/${params.storeId}/orders/${shipment.order.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {shipment.order.orderNumber}
                  </Link>
                </div>
                <div>
                  <p className="mb-1 text-sm text-muted-foreground">Cliente</p>
                  <p className="font-medium">{shipment.order.fullName}</p>
                </div>
                <div>
                  <p className="mb-1 text-sm text-muted-foreground">Teléfono</p>
                  <DataTableCellPhone
                    phoneNumber={shipment.order.phone}
                    className="font-medium"
                  />
                </div>
              </div>

              <Separator className="my-4" />

              <div>
                <p className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  Dirección de entrega
                </p>
                <p className="font-medium">{shipment.order.address}</p>
                {shipment.order.neighborhood && (
                  <p className="text-sm text-muted-foreground">
                    {shipment.order.neighborhood}
                  </p>
                )}
              </div>

              {shipment.order.orderItems.length > 0 && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <p className="mb-3 text-sm text-muted-foreground">
                      Productos ({shipment.order.orderItems.length})
                    </p>
                    <div className="space-y-2">
                      {shipment.order.orderItems.map((item) => {
                        const mainImage = item.product.images.find(
                          (img) => img.isMain,
                        );
                        const imageUrl =
                          mainImage?.url || item.product.images[0]?.url;

                        return (
                          <div
                            key={item.id}
                            className="flex items-center gap-3 rounded-md bg-muted/50 p-2"
                          >
                            {imageUrl && (
                              <Image
                                src={imageUrl}
                                alt={item.product.name}
                                width={40}
                                height={40}
                                className="rounded object-cover"
                              />
                            )}
                            <div className="flex-1">
                              <p className="text-sm font-medium">
                                {item.product.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Cantidad: {item.quantity}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Additional Info Card */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Información Adicional</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-1 text-sm text-muted-foreground">
                  Fecha de creación
                </p>
                <p className="font-medium">
                  {format(new Date(shipment.createdAt), "PPP 'a las' p", {
                    locale: es,
                  })}
                </p>
              </div>
              <div>
                <p className="mb-1 text-sm text-muted-foreground">
                  Última actualización
                </p>
                <p className="font-medium">
                  {format(new Date(shipment.updatedAt), "PPP 'a las' p", {
                    locale: es,
                  })}
                </p>
              </div>
            </div>

            {shipment.notes && (
              <>
                <Separator className="my-4" />
                <div>
                  <p className="mb-2 text-sm text-muted-foreground">Notas</p>
                  <p className="text-sm">{shipment.notes}</p>
                </div>
              </>
            )}

            {shipment.provider === ShippingProvider.ENVIOCLICK && (
              <>
                <Separator className="my-4" />
                <div className="grid gap-4 md:grid-cols-2">
                  {shipment.envioClickIdRate && (
                    <div>
                      <p className="mb-1 text-sm text-muted-foreground">
                        ID de cotización
                      </p>
                      <p className="font-mono text-sm">
                        {shipment.envioClickIdRate}
                      </p>
                    </div>
                  )}
                  {shipment.envioClickIdOrder && (
                    <div>
                      <p className="mb-1 text-sm text-muted-foreground">
                        ID de orden EnvioClick
                      </p>
                      <p className="font-mono text-sm">
                        {shipment.envioClickIdOrder}
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
