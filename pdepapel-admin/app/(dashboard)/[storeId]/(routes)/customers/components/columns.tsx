"use client";

import { Badge } from "@/components/ui/badge";
import { DataTableCellCurrency } from "@/components/ui/data-table-cell-currency";
import { DataTableCellDate } from "@/components/ui/data-table-cell-date";
import { DataTableCellNumber } from "@/components/ui/data-table-cell-number";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { WhatsappButton } from "@/components/whatsapp-button";
import { ColumnDef } from "@tanstack/react-table";
import { Phone, User } from "lucide-react";
import { CustomerData } from "../server/get-customers";
import { CellAction } from "./cell-action";

export type CustomerColumn = CustomerData;

export const columns: ColumnDef<CustomerColumn>[] = [
  {
    accessorKey: "fullName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Cliente" />
    ),
    cell: ({ row }) => (
      <div className="flex items-center space-x-2">
        <User className="h-4 w-4 text-muted-foreground" />
        <div>
          <div className="font-medium">{row.original.fullName}</div>
          {row.original.email && (
            <div className="text-sm text-muted-foreground">
              {row.original.email}
            </div>
          )}
        </div>
      </div>
    ),
  },
  {
    accessorKey: "phone",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Teléfono" />
    ),
    cell: ({ row }) => (
      <div className="flex items-center space-x-2">
        <Phone className="h-4 w-4 text-muted-foreground" />
        <span className="font-mono">{row.original.phone}</span>
      </div>
    ),
  },
  {
    accessorKey: "totalOrders",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Total órdenes" />
    ),
    cell: ({ row }) => (
      <div className="flex items-center space-x-2">
        <DataTableCellNumber value={row.original.totalOrders} />
        <div className="flex space-x-1">
          {row.original.paidOrders > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="success" className="text-xs">
                    {row.original.paidOrders}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Órdenes pagadas</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {row.original.pendingOrders > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="secondary" className="text-xs">
                    {row.original.pendingOrders}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Órdenes pendientes</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {row.original.cancelledOrders > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="destructive" className="text-xs">
                    {row.original.cancelledOrders}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Órdenes canceladas</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    ),
  },
  {
    accessorKey: "totalSpent",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Total gastado" />
    ),
    cell: ({ row }) => (
      <DataTableCellCurrency value={row.original.totalSpent} />
    ),
  },
  {
    accessorKey: "averageOrderValue",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Valor promedio" />
    ),
    cell: ({ row }) => (
      <DataTableCellCurrency value={row.original.averageOrderValue} />
    ),
  },
  {
    accessorKey: "totalItems",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Items comprados" />
    ),
    cell: ({ row }) => <DataTableCellNumber value={row.original.totalItems} />,
  },
  {
    accessorKey: "favoriteProducts",
    header: "Productos favoritos",
    cell: ({ row }) => (
      <div className="max-w-xs">
        {row.original.favoriteProducts.length > 0 ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <div className="text-sm">
                  {row.original.favoriteProducts[0].name}
                  {row.original.favoriteProducts.length > 1 && (
                    <span className="text-muted-foreground">
                      {" "}
                      y {row.original.favoriteProducts.length - 1} más
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <div className="space-y-1">
                  {row.original.favoriteProducts.map((product, index) => (
                    <div key={index} className="text-xs">
                      <span className="font-medium">{product.name}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        ({product.count} unidades)
                      </span>
                    </div>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <span className="text-sm text-muted-foreground">Sin compras</span>
        )}
      </div>
    ),
    enableSorting: false,
  },
  {
    accessorKey: "firstOrderDate",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Primera orden" />
    ),
    cell: ({ row }) => (
      <DataTableCellDate date={row.original.firstOrderDate!} />
    ),
  },
  {
    accessorKey: "lastOrderDate",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Última orden" />
    ),
    cell: ({ row }) => <DataTableCellDate date={row.original.lastOrderDate!} />,
  },
  {
    id: "whatsapp",
    header: "WhatsApp",
    cell: ({ row }) => (
      <WhatsappButton
        customer={{
          fullName: row.original.fullName,
          phone: row.original.phone,
          totalOrders: row.original.totalOrders,
          totalSpent: row.original.totalSpent,
          recentOrders: row.original.recentOrders,
        }}
        compact
      />
    ),
    enableSorting: false,
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
