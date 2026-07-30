import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { currencyFormatter } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  CreditCard,
  DollarSign,
  LayoutDashboard,
  Package,
} from "lucide-react";
import { Metadata } from "next";
import { getInventorySummary } from "./server/get-inventory-summary";

export const metadata: Metadata = {
  title: "Inventario Dashboard",
  description: "Resumen de inventario y costos.",
};

export default async function InventoryPage({
  params,
}: {
  params: { storeId: string };
}) {
  const summary = await getInventorySummary(params.storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <Heading
          title="Panel de Inventario"
          description="Resumen de valorización y salud del stock."
        />
        <Separator />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Valor Total (Costo)
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {currencyFormatter(summary.stockValue)}
              </div>
              <p className="text-xs text-muted-foreground">
                Base: Precio de Costo
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Valor Total (Venta)
              </CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {currencyFormatter(summary.retailValue)}
              </div>
              <p className="text-xs text-muted-foreground">
                Mayor potencial de ingreso
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Productos Activos
              </CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalProducts}</div>
              <p className="text-xs text-muted-foreground">
                SKUs en el catálogo
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Stock Bajo</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summary.lowStockProducts}
              </div>
              <p className="text-xs text-muted-foreground">
                Productos con 10 o menos unidades
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-7">
          <Card className="col-span-4">
            <CardHeader>
              <CardTitle>Actividad Reciente</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {summary.recentMovements.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No hay movimientos recientes.
                  </p>
                )}
                {summary.recentMovements.map((movement: any) => (
                  <div
                    key={movement.id}
                    className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {movement.product.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {movement.reason || movement.type}
                      </p>
                    </div>
                    <div
                      className={`font-bold ${movement.quantity > 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {movement.quantity > 0 ? "+" : ""}
                      {movement.quantity}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="col-span-3">
            <CardHeader>
              <CardTitle>Estado del Sistema</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <Activity className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">
                  Sincronización de Stock: Activa
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Ventas Totales
              </CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {currencyFormatter(summary.realizedRevenue)}
              </div>
              <p className="text-xs text-muted-foreground">
                Ingresos por ventas (Histórico)
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Costos
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {currencyFormatter(summary.realizedCOGS)}
              </div>
              <p className="text-xs text-muted-foreground">
                Costo de mercancía vendida
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Margen Bruto
              </CardTitle>
              <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {currencyFormatter(summary.grossMargin)}
              </div>
              <p className="text-xs text-muted-foreground">
                Beneficio bruto total
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
