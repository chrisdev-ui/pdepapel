import { getAverageOrderValue } from "@/actions/get-average-order-value";
import { getCategorySales } from "@/actions/get-category-sales";
import { getSalesData } from "@/actions/get-sales-data";
import { getTopSellingProducts } from "@/actions/get-top-selling-products";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatter } from "@/lib/utils";

interface AnalyticsProps {
  params: { storeId: string };
  year: number;
}

export const Analytics: React.FC<AnalyticsProps> = async ({ params, year }) => {
  const salesData = await getSalesData(params.storeId, year);
  const categorySales = await getCategorySales(params.storeId, year);
  const averageOrderValue = await getAverageOrderValue(params.storeId, year);
  const topSellingProducts = await getTopSellingProducts(params.storeId, year);

  return (
    <div className="flex flex-col space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Resumen de ventas</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Ingresos</TableHead>
                <TableHead>Órdenes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salesData.map((data) => (
                <TableRow key={data.date}>
                  <TableCell>{data.date}</TableCell>
                  <TableCell>{formatter.format(data.revenue)}</TableCell>
                  <TableCell>{data.orders}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ventas por categoría</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Ventas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categorySales.map((category) => (
                  <TableRow key={category.category}>
                    <TableCell>{category.category}</TableCell>
                    <TableCell>{formatter.format(category.sales)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Productos más vendidos</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Cantidad vendida</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topSellingProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>{product.name}</TableCell>
                    <TableCell>{product.totalSold}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Métricas de ventas para el año {year}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-lg font-semibold">
                Valor promedio de una órden
              </h3>
              <p className="text-3xl font-bold">
                {formatter.format(averageOrderValue)}
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold">Ventas totales</h3>
              <p className="text-3xl font-bold">
                {formatter.format(
                  salesData.reduce((sum, data) => sum + data.revenue, 0),
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
