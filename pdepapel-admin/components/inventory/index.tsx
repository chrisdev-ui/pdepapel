import { getProducts } from "@/actions/get-products";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatter } from "@/lib/utils";
import { AlertTriangle, Package } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { InventoryClient } from "./client";

interface InventoryProps {
  products: Awaited<ReturnType<typeof getProducts>>;
  lowStockCount: number;
  outOfStockCount: number;
}

export const Inventory: React.FC<InventoryProps> = ({
  products,
  lowStockCount,
  outOfStockCount,
}) => {
  const categories = Array.from(new Set(products.map((p) => p.category)));

  const stockData = categories.map((category) => ({
    category,
    stock: products
      .filter((p) => p.category === category)
      .reduce((sum, p) => sum + p.stock, 0),
  }));

  const tableProducts = products.map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category.name,
    stock: String(product.stock),
    price: formatter.format(product.price),
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
          <CardTitle>Stock by Category</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stockData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="stock" fill="#AD8FE1" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Product Inventory</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px] md:h-auto">
            <div className="space-y-4 pb-4 md:pb-0">
              <div className="rounded-md border">
                <InventoryClient data={tableProducts} />
              </div>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};
