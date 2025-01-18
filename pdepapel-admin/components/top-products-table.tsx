import { getTopSellingProducts } from "@/actions/get-top-selling-products";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TopProductsTableProps {
  topSellingProducts: Awaited<ReturnType<typeof getTopSellingProducts>>;
}

const getMedal = (index: number) => {
  switch (index) {
    case 0:
      return <span className="mr-2 text-lg">🥇</span>;
    case 1:
      return <span className="mr-2 text-lg">🥈</span>;
    case 2:
      return <span className="mr-2 text-lg">🥉</span>;
    default:
      return null;
  }
};

export const TopProductsTable: React.FC<TopProductsTableProps> = ({
  topSellingProducts,
}) => {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Producto</TableHead>
          <TableHead>Cantidad vendida</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {topSellingProducts.map((product, index) => (
          <TableRow key={product.id}>
            <TableCell>
              <div className="flex items-center">
                {getMedal(index)}
                {product.name}
              </div>
            </TableCell>
            <TableCell>{product.totalSold}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
