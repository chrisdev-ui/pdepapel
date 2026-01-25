"use client";

import { Badge } from "@/components/ui/badge";
import { DataTableCellCurrency } from "@/components/ui/data-table-cell-currency";
import { DataTableCellDate } from "@/components/ui/data-table-cell-date";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { Icons } from "@/components/ui/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { WhatsappButton } from "@/components/whatsapp-button";
import { paymentNames } from "@/constants";
import { currencyFormatter } from "@/lib/utils";
import { OrderStatus, PaymentMethod, ShippingStatus } from "@prisma/client";
import { ColumnDef } from "@tanstack/react-table";
import { Check, Edit, Receipt, Sparkles } from "lucide-react";
import { getOrders } from "../server/get-orders";
import { CellAction } from "./cell-action";
import { ProductList } from "./product-list";

export type OrderColumn = Awaited<ReturnType<typeof getOrders>>[number];

export const columns: ColumnDef<OrderColumn>[] = [
  {
    accessorKey: "orderNumber",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Orden" />
    ),
    cell: ({ row }) => (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Receipt className="h-8 w-8" />
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{row.original.orderNumber}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ),
  },
  {
    accessorKey: "type",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Tipo" />
    ),
    cell: ({ row }) => {
      const type = row.original.type; // OrderType
      // Use string keys to avoid import dependency if enum not available in scope,
      // but ideally we import OrderType.
      // Based on schema: STANDARD, QUOTATION, CUSTOM
      const icons = {
        STANDARD: {
          icon: <Check className="mr-2 h-4 w-4" />,
          label: "Estándar",
          variant: "outline",
          className: "border-blue-200 bg-blue-50 text-blue-700",
        },
        QUOTATION: {
          icon: <Sparkles className="mr-2 h-4 w-4" />,
          label: "Cotización",
          variant: "secondary",
          className: "border-purple-200 bg-purple-50 text-purple-700",
        },
        CUSTOM: {
          icon: <Edit className="mr-2 h-4 w-4" />,
          label: "Manual",
          variant: "secondary",
          className: "border-orange-200 bg-orange-50 text-orange-700",
        },
      } as const;

      const config = icons[type as keyof typeof icons] || icons.STANDARD;

      return (
        <Badge variant={config.variant as any} className={config.className}>
          {config.icon}
          {config.label}
        </Badge>
      );
    },
  },
  {
    id: "products",
    accessorFn: (row) =>
      row.orderItems.map((orderItem) => ({
        id: orderItem.product?.id || "manual",
        name: orderItem.product?.name || orderItem.name,
        sku: orderItem.product?.sku || orderItem.sku || "N/A",
        quantity: orderItem.quantity,
        image:
          orderItem.product?.images.find((image) => image.isMain)?.url ??
          orderItem.product?.images[0]?.url ??
          orderItem.imageUrl ??
          "",
      })),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Productos" />
    ),
    cell: ({ row }) => (
      <ProductList
        products={row.original.orderItems.map((orderItem) => ({
          id: orderItem.product?.id || "manual",
          name: orderItem.product?.name || orderItem.name,
          sku: orderItem.product?.sku || orderItem.sku || "N/A",
          quantity: orderItem.quantity,
          image:
            orderItem.product?.images.find((image) => image.isMain)?.url ??
            orderItem.product?.images[0]?.url ??
            orderItem.imageUrl ??
            "",
        }))}
      />
    ),
    enableSorting: false,
  },
  {
    accessorKey: "phone",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Ir a WhatsApp" />
    ),
    cell: ({ row }) => (
      <WhatsappButton
        order={{
          orderNumber: row.original.orderNumber,
          status: row.original.status,
          fullName: row.original.fullName,
          phone: row.original.phone,
          totalPrice: currencyFormatter(row.original.total),
          products: row.original.orderItems.map((orderItem) => ({
            name: orderItem.product?.name || orderItem.name,
            sku: orderItem.product?.sku || orderItem.sku || "N/A",
            quantity: orderItem.quantity,
          })),
        }}
        withText
      />
    ),
    enableSorting: false,
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
    id: "paymentMethod",
    accessorKey: "payment.method",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Método de pago" />
    ),
    cell: ({ row }) => {
      const paymentMethod = row.original.payment?.method;
      if (!paymentMethod) return null;
      const PaymentIcon = () => {
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
      };

      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <PaymentIcon />
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">{paymentNames[paymentMethod]}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
  },
  {
    id: "totalPrice",
    accessorKey: "total",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Precio total" />
    ),
    cell: ({ row }) => <DataTableCellCurrency value={row.original.total} />,
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Estado de la orden" />
    ),
    cell: ({ row }) => {
      const status = row.original.status;
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
        [OrderStatus.DRAFT]: { variant: "outline", text: `📝 Borrador` },
        [OrderStatus.QUOTATION]: { variant: "outline", text: `📋 Cotización` },
        [OrderStatus.SENT]: { variant: "secondary", text: `📤 Enviada` },
        [OrderStatus.VIEWED]: { variant: "secondary", text: `👀 Vista` },
        [OrderStatus.ACCEPTED]: { variant: "success", text: `✅ Aceptada` },
        [OrderStatus.REJECTED]: {
          variant: "destructive",
          text: `❌ Rechazada`,
        },
      };

      const statusConfig = variants[status] || {
        variant: "outline",
        text: status,
      };

      return (
        <Badge
          variant={statusConfig.variant}
          className="flex items-center justify-center [word-spacing:.2rem]"
        >
          <span className="capitalize tracking-wide">{statusConfig.text}</span>
        </Badge>
      );
    },
  },
  {
    id: "shippingStatus",
    accessorKey: "shipping.status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Estado del envío" />
    ),
    cell: ({ row }) => {
      const status = row.original.shipping?.status;
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
        [ShippingStatus.PickedUp]: {
          variant: "secondary",
          text: "📮 Recogido",
        },
        [ShippingStatus.InTransit]: {
          variant: "secondary",
          text: "⛟ En tránsito",
        },
        [ShippingStatus.OutForDelivery]: {
          variant: "secondary",
          text: "🚚 En reparto",
        },
        [ShippingStatus.Delivered]: {
          variant: "success",
          text: "🏠 Entregado",
        },
        [ShippingStatus.FailedDelivery]: {
          variant: "destructive",
          text: "❌ Entrega fallida",
        },
        [ShippingStatus.Returned]: {
          variant: "destructive",
          text: "🔙 Retornado",
        },
        [ShippingStatus.Cancelled]: {
          variant: "destructive",
          text: "🚫 Cancelado",
        },
        [ShippingStatus.Exception]: {
          variant: "destructive",
          text: "⚠️ Incidencia",
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
    cell: ({ row }) => <DataTableCellDate date={row.original.createdAt} />,
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
