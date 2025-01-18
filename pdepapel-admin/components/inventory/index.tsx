import { getLowStockCount } from "@/actions/get-low-stock-count";
import { getOutOfStockCount } from "@/actions/get-out-of-stock-count";
import { getPotentialProfit } from "@/actions/get-potential-profit";
import { getPotentialRevenue } from "@/actions/get-potential-revenue";
import { getProducts } from "@/actions/get-products";
import { getTotalCost } from "@/actions/get-total-cost";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatter } from "@/lib/utils";
import {
  AlertCircle,
  AlertTriangle,
  DollarSign,
  Package,
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

  const categories = Array.from(new Set(products.map((p) => p.category)));

  const stockData = categories.map((category) => ({
    category,
    stock: products
      .filter((p) => p.category === category)
      .reduce((sum, p) => sum + Number(p.stock), 0),
  }));

  return (
    <div className="flex flex-col space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <Link href={`/${params.storeId}/products`}>
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
          <Link href={`/${params.storeId}/out-of-stock`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Productos agotados
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{outOfStockCount}</div>
            </CardContent>
          </Link>
        </Card>
        <Card>
          <Link href={`/${params.storeId}/low-stock`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Productos por agotarse
              </CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{lowStockCount}</div>
            </CardContent>
          </Link>
        </Card>
      </div>
      <div className="grid max-h-screen grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Inventario de productos</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px] md:h-auto">
              <InventoryClient data={products} />
            </ScrollArea>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Inventario por categoría</CardTitle>
          </CardHeader>
          <CardContent className="h-screen max-h-screen w-full">
            <InventoryByCategory data={stockData} />
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
                {formatter.format(totalCost)}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Ingresos potenciales</h3>
              </div>
              <p className="text-3xl font-bold">
                {formatter.format(potentialRevenue)}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Ganancia potencial</h3>
              </div>
              <p className="text-3xl font-bold">
                {formatter.format(potentialProfit)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
