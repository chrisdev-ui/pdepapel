import { getLowStockCount } from "@/actions/get-low-stock-count";
import { getOutOfStockCount } from "@/actions/get-out-of-stock-count";
import { getPotentialProfit } from "@/actions/get-potential-profit";
import { getPotentialRevenue } from "@/actions/get-potential-revenue";
import { getProducts } from "@/actions/get-products";
import { getTotalCost } from "@/actions/get-total-cost";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ModelLabels, Models } from "@/constants";
import { currencyFormatter } from "@/lib/utils";
import {
  AlertCircle,
  AlertTriangle,
  DollarSign,
  Package,
  Sparkles,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { InventoryByCategory } from "../inventory-by-category";
import { InventoryClient } from "./client";

interface InventoryProps {
  params: { storeId: string };
}

export const Inventory: React.FC<InventoryProps> = async ({ params }) => {
  const products = await getProducts(params.storeId);
  const outOfStockCount = await getOutOfStockCount(params.storeId);
  const lowStockCount = await getLowStockCount(params.storeId);

  const totalCost = await getTotalCost(params.storeId);
  const potentialRevenue = await getPotentialRevenue(params.storeId);
  const potentialProfit = await getPotentialProfit(params.storeId);

  const categories = Array.from(new Set(products.map((p) => p.category.name)));

  const stockData = categories
    .map((category) => ({
      category,
      stock: products
        .filter((p) => p.category.name === category)
        .reduce((sum, p) => sum + Number(p.stock), 0),
    }))
    .filter(({ stock }) => stock > 0);

  return (
    <div className="flex flex-col space-y-4">
      {/* 💡 Acciones Sugeridas para el Administrador */}
      <Card className="border-2 border-purple-200 bg-gradient-to-r from-purple-50 via-pink-50 to-white p-4 shadow-sm dark:border-purple-900 dark:from-purple-950/40 dark:to-zinc-900">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 font-bold text-purple-950 dark:text-purple-100">
            <Sparkles className="h-5 w-5 text-purple-600" />
            <span>Acciones Sugeridas para el Administrador</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="rounded-xl border border-red-200 bg-white p-3 shadow-sm dark:border-red-900/50 dark:bg-zinc-900">
              <span className="font-bold text-red-600 block mb-1">🔴 Agotados Urgentes ({outOfStockCount})</span>
              <p className="text-muted-foreground">
                {outOfStockCount > 0
                  ? `Tienes ${outOfStockCount} productos agotados. Crea una Orden de Recompra para reabastecer.`
                  : "¡Excelente! No tienes productos agotados actualmente."}
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-white p-3 shadow-sm dark:border-amber-900/50 dark:bg-zinc-900">
              <span className="font-bold text-amber-600 block mb-1">🟡 Alertas de Bajo Stock ({lowStockCount})</span>
              <p className="text-muted-foreground">
                {lowStockCount > 0
                  ? `Hay ${lowStockCount} productos con pocas unidades. Revisa tu lista antes de que se agoten.`
                  : "Stock saludable en tus productos principales."}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-white p-3 shadow-sm dark:border-emerald-900/50 dark:bg-zinc-900">
              <span className="font-bold text-emerald-600 block mb-1">🟢 Valor Estimado del Inventario</span>
              <p className="font-bold text-emerald-950 dark:text-emerald-200 text-sm">
                {currencyFormatter(potentialRevenue)}
              </p>
            </div>
          </div>
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <Link href={`/${params.storeId}/${Models.Products}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total de productos en inventario
              </CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{products.length}</div>
            </CardContent>
          </Link>
        </Card>
        <Card>
          <Link href={`/${params.storeId}/${Models.OutOfStock}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {ModelLabels[Models.OutOfStock]}
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{outOfStockCount}</div>
            </CardContent>
          </Link>
        </Card>
        <Card>
          <Link href={`/${params.storeId}/${Models.LowStock}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {ModelLabels[Models.LowStock]}
              </CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{lowStockCount}</div>
            </CardContent>
          </Link>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Inventario de productos</CardTitle>
          </CardHeader>
          <CardContent className="w-full flex-grow">
            <div className="w-full overflow-auto">
              <ScrollArea className="h-[300px] w-full min-w-max md:h-[400px] lg:h-[500px] xl:h-[870px]">
                <InventoryClient data={products} />
              </ScrollArea>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Inventario por categoría</CardTitle>
          </CardHeader>
          <CardContent className="w-full flex-grow">
            <div className="w-full overflow-auto">
              <ScrollArea className="h-[300px] w-full min-w-max md:h-[400px] lg:h-[500px] xl:h-[870px]">
                <InventoryByCategory data={stockData} />
              </ScrollArea>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Métricas del inventario actual</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold">
                  Costo total del inventario
                </h3>
              </div>
              <p className="text-3xl font-bold">
                {currencyFormatter(totalCost)}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Ingresos potenciales</h3>
              </div>
              <p className="text-3xl font-bold">
                {currencyFormatter(potentialRevenue)}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Ganancia potencial</h3>
              </div>
              <p className="text-3xl font-bold">
                {currencyFormatter(potentialProfit)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
