"use client";

import { Badge } from "@/components/ui/badge";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { Icons } from "@/components/ui/icons";
import { WhatsappButton } from "@/components/whatsapp-button";
import { OrderStatus, PaymentMethod, ShippingStatus } from "@prisma/client";
import { ColumnDef } from "@tanstack/react-table";
import { getOrders } from "../server/get-orders";
import { CellAction } from "./cell-action";
import { ProductList } from "./product-list";

export type OrderColumn = Awaited<ReturnType<typeof getOrders>>[number];

export const columns: ColumnDef<OrderColumn>[] = [
  {
    accessorKey: "orderNumber",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Número de orden" />
    ),
  },
  {
    accessorKey: "products",
    header: "Productos",
    cell: ({ row }) => <ProductList products={row.original.products} />,
  },
  {
    accessorKey: "phone",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Ir a WhatsApp" />
    ),
    cell: ({ row }) => (
      <WhatsappButton phone={row.original.phone as string} withText />
    ),
  },
  {
    accessorKey: "address",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Dirección" />
    ),
    cell: ({ row }) => (
      <div className="max-w-xs whitespace-normal break-words">
        {row.original.address}
      </div>
    ),
  },
  {
    accessorKey: "paymentMethod",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Método de pago" />
    ),
    cell: ({ row }) => {
      const paymentMethod = row.original.paymentMethod;
      if (!paymentMethod) return null;
      switch (paymentMethod) {
        case PaymentMethod.BankTransfer:
          return <Icons.bancolombia className="h-8 w-8" />;
        case PaymentMethod.COD:
          return <Icons.cashOnDelivery className="h-8 w-8" />;
        case PaymentMethod.PayU:
          return <Icons.payu className="h-12 w-12" />;
        case PaymentMethod.Wompi:
          return <Icons.wompi className="h-auto w-16" />;
        default:
          return null;
      }
    },
  },
  {
    accessorKey: "totalPrice",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Precio total" />
    ),
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Estado de la orden" />
    ),
    cell: ({ row }) => {
      const status = row.getValue("status") as OrderStatus | undefined;
      if (!status) return null;
      const variants: Record<
        OrderStatus,
        {
          variant: "outline" | "secondary" | "success" | "destructive";
          text: string;
        }
      > = {
        [OrderStatus.PENDING]: { variant: "outline", text: `⌛ Pendiente` },
        [OrderStatus.CREATED]: { variant: "secondary", text: `📖 Creada` },
        [OrderStatus.PAID]: { variant: "success", text: `💵 Pagada` },
        [OrderStatus.CANCELLED]: {
          variant: "destructive",
          text: `🚫 Cancelada`,
        },
      };
      return (
        <Badge
          variant={variants[status].variant}
          className="flex items-center justify-center [word-spacing:.2rem]"
        >
          <span className="capitalize tracking-wide">
            {variants[status].text}
          </span>
        </Badge>
      );
    },
  },
  {
    accessorKey: "shippingStatus",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Estado del envío" />
    ),
    cell: ({ row }) => {
      const status = row.getValue("shippingStatus") as
        | ShippingStatus
        | undefined;
      if (!status) return null;
      const variants: Record<
        ShippingStatus,
        {
          variant: "outline" | "secondary" | "success" | "destructive";
          text: string;
        }
      > = {
        [ShippingStatus.Preparing]: {
          variant: "outline",
          text: "📦 Preparando",
        },
        [ShippingStatus.Shipped]: {
          variant: "secondary",
          text: "🚀 Despachada",
        },
        [ShippingStatus.InTransit]: {
          variant: "secondary",
          text: "⛟ En tránsito",
        },
        [ShippingStatus.Delivered]: {
          variant: "success",
          text: "🏠 Entregado",
        },
        [ShippingStatus.Returned]: {
          variant: "destructive",
          text: "🚫 Retornado",
        },
      };
      return (
        <Badge
          variant={variants[status].variant}
          className="flex items-center justify-center [word-spacing:.2rem]"
        >
          <span className="capitalize tracking-wide">
            {variants[status].text}
          </span>
        </Badge>
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Fecha de creación" />
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
