import { Table } from "@tanstack/react-table";

import { WishlistColumn } from "@/app/(routes)/wishlist/components/columns";
import { Button } from "@/components/ui/button";
import { useWishlist } from "@/hooks/use-wishlist";
import { ArrowLeft, ArrowRight, PlusCircle, Trash } from "lucide-react";

interface DataTablePaginationProps<TData extends WishlistColumn> {
  table: Table<TData>;
}

export function DataTablePagination<TData extends WishlistColumn>({
  table,
}: DataTablePaginationProps<TData>) {
  const { clearWishlist, moveToCartMultiple } = useWishlist();
  return (
    <div className="flex flex-col items-center justify-center space-y-3 py-4 sm:flex-row sm:justify-end sm:space-x-2 sm:space-y-0">
      {table.getFilteredSelectedRowModel().rows.length > 0 && (
        <Button
          size="sm"
          className="flex items-center gap-2"
          onClick={() =>
            moveToCartMultiple(
              table
                .getFilteredSelectedRowModel()
                .rows.map((row) => row.original.id),
            )
          }
        >
          <PlusCircle className="h-4 w-4" />
          <span>
            Mover {table.getFilteredSelectedRowModel().rows.length} producto(s)
            al carrito
          </span>
        </Button>
      )}
      <Button
        size="sm"
        className="flex items-center gap-2"
        onClick={clearWishlist}
      >
        <Trash className="h-4 w-4" />
        <span>Limpiar tú lista de deseos</span>
      </Button>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
