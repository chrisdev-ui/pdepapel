import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { currencyFormatter } from "@/lib/utils";
import {
  AlertCircle,
  BarChart3,
  Calendar,
  CheckCircle2,
  DollarSign,
  Package,
  TrendingUp,
  TruckIcon,
} from "lucide-react";
import { getShippingAnalytics } from "../server/get-shipping-analytics";

interface ShippingAnalyticsProps {
  storeId: string;
}

export async function ShippingAnalytics({ storeId }: ShippingAnalyticsProps) {
  const analytics = await getShippingAnalytics(storeId);

  const cards = [
    {
      title: "Total de Envíos",
      value: analytics.totalShipments.toString(),
      icon: Package,
      description: "Todos los envíos registrados",
    },
    {
      title: "Envíos Activos",
      value: analytics.activeShipments.toString(),
      icon: TruckIcon,
      description: "En preparación o tránsito",
    },
    {
      title: "Entregas Exitosas",
      value: analytics.deliveredShipments.toString(),
      icon: CheckCircle2,
      description: `${analytics.deliveryRate}% de tasa de entrega`,
    },
    {
      title: "Entregas Fallidas",
      value: analytics.failedDeliveries.toString(),
      icon: AlertCircle,
      description: "Retornados o con incidencias",
    },
    {
      title: "Costo Total de Envíos",
      value: currencyFormatter.format(analytics.totalShippingCost),
      icon: DollarSign,
      description: "Suma de todos los costos",
    },
    {
      title: "Costo Promedio",
      value: currencyFormatter.format(analytics.averageShippingCost),
      icon: BarChart3,
      description: "Por envío",
    },
    {
      title: "Este Mes",
      value: analytics.thisMonthShipments.toString(),
      icon: Calendar,
      description: "Envíos en el mes actual",
    },
    {
      title: "Últimos 30 Días",
      value: analytics.last30DaysShipments.toString(),
      icon: TrendingUp,
      description: "Actividad reciente",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {card.title}
              </CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground">
                {card.description}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
