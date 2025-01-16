import { getLowStockCount } from "@/actions/get-low-stock-count";
import { getOutOfStockCount } from "@/actions/get-out-of-stock-count";
import { getProducts } from "@/actions/get-products";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, Package } from "lucide-react";
import { InventoryClient } from "./client";

interface InventoryProps {
  params: { storeId: string };
}

export const Inventory: React.FC<InventoryProps> = async ({ params }) => {
  const products = await getProducts(params.storeId);
  const outOfStockCount = await getOutOfStockCount(params.storeId);
  const lowStockCount = await getLowStockCount(params.storeId);

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
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total de productos en inventario
            </CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{products.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Productos agotados
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{outOfStockCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Productos por agotarse
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lowStockCount}</div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Inventario por categoría</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stockData.map((item) => (
                <TableRow key={item.category}>
                  <TableCell>{item.category}</TableCell>
                  <TableCell className="text-right">{item.stock}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Inventario de productos</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px] md:h-auto">
            <div className="space-y-4 pb-4 md:pb-0">
              <div className="rounded-md border">
                <InventoryClient data={products} />
              </div>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};
