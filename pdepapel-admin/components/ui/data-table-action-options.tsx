"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Models, ModelsColumns } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { makeApiCall } from "@/lib/api";
import { cn } from "@/lib/utils";
import { OrderStatus, ShippingStatus } from "@prisma/client";
import { Table } from "@tanstack/react-table";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  Download,
  ImageOff,
  Loader,
  Star,
  StarOff,
  Trash,
} from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertModal } from "../modals/alert-modal";

export type Action =
  | "delete"
  | "archive"
  | "unarchive"
  | "export"
  | "feature"
  | "unfeature"
  | "clear-images"
  | "mark-as-created"
  | "mark-as-pending"
  | "mark-as-paid"
  | "mark-as-cancelled"
  | "mark-as-preparing"
  | "mark-as-shipped"
  | "mark-as-in-transit"
  | "mark-as-delivered"
  | "mark-as-returned";

interface DataTableActionOptionsProps<TData> {
  table: Table<TData>;
  model: Models;
}

const orderStatusMap: Record<
  Extract<
    Action,
    "mark-as-created" | "mark-as-pending" | "mark-as-paid" | "mark-as-cancelled"
  >,
  OrderStatus
> = {
  "mark-as-created": OrderStatus.CREATED,
  "mark-as-pending": OrderStatus.PENDING,
  "mark-as-paid": OrderStatus.PAID,
  "mark-as-cancelled": OrderStatus.CANCELLED,
};

const shippingStatusMap: Record<
  Extract<
    Action,
    | "mark-as-preparing"
    | "mark-as-shipped"
    | "mark-as-in-transit"
    | "mark-as-delivered"
    | "mark-as-returned"
  >,
  ShippingStatus
> = {
  "mark-as-preparing": ShippingStatus.Preparing,
  "mark-as-shipped": ShippingStatus.Shipped,
  "mark-as-in-transit": ShippingStatus.InTransit,
  "mark-as-delivered": ShippingStatus.Delivered,
  "mark-as-returned": ShippingStatus.Returned,
};

const MODEL_MAPPING: Partial<Record<Models, Models>> = {
  [Models.LowStock]: Models.Products,
  [Models.OutOfStock]: Models.Products,
};

export function DataTableActionOptions<TData>({
  table,
  model,
}: DataTableActionOptionsProps<TData>) {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<Action | null>(null);

  const routeActions: Action[] = useMemo(() => {
    switch (model) {
      case Models.Products:
      case Models.LowStock:
      case Models.OutOfStock:
        return [
          "delete",
          "archive",
          "unarchive",
          "export",
          "feature",
          "unfeature",
          "clear-images",
        ];
      case Models.Inventory:
      case Models.SalesByCategory:
        return [];
      case Models.Orders:
        return [
          "delete",
          "export",
          "mark-as-created",
          "mark-as-pending",
          "mark-as-paid",
          "mark-as-cancelled",
          "mark-as-preparing",
          "mark-as-shipped",
          "mark-as-in-transit",
          "mark-as-delivered",
          "mark-as-returned",
        ];
      default:
        return ["delete", "export"];
    }
  }, [model]);

  const handleAction = async (action: Action) => {
    setIsLoading(true);
    try {
      switch (action) {
        case "delete":
          await makeApiCall<{ ids: string[] }>(
            `/${params.storeId}/${MODEL_MAPPING[model] || model}`,
            "DELETE",
            {
              ids: table
                .getFilteredSelectedRowModel()
                .rows.map((row) => (row.original as { id: string }).id),
            },
          );
          router.refresh();
          toast({
            description: `${table.getFilteredSelectedRowModel().rows.length} elemento(s) ${getActionDescription(
              action,
            )}`,
            variant: "success",
          });
          table.resetRowSelection();
          break;
        case "archive":
        case "unarchive":
          await makeApiCall<{
            ids: string[];
            isArchived: boolean;
          }>(`/${params.storeId}/${MODEL_MAPPING[model] || model}`, "PATCH", {
            ids: table
              .getFilteredSelectedRowModel()
              .rows.map((row) => (row.original as { id: string }).id),
            isArchived: action === "archive",
          });
          router.refresh();
          toast({
            description: `${table.getFilteredSelectedRowModel().rows.length} elemento(s) ${getActionDescription(
              action,
            )}`,
            variant: "success",
          });
          table.resetRowSelection();
          break;
        case "feature":
        case "unfeature":
          await makeApiCall<{
            ids: string[];
            isFeatured: boolean;
          }>(`/${params.storeId}/${MODEL_MAPPING[model] || model}`, "PATCH", {
            ids: table
              .getFilteredSelectedRowModel()
              .rows.map((row) => (row.original as { id: string }).id),
            isFeatured: action === "feature",
          });
          router.refresh();
          toast({
            description: `${table.getFilteredSelectedRowModel().rows.length} elemento(s) ${getActionDescription(
              action,
            )}`,
            variant: "success",
          });
          table.resetRowSelection();
          break;
        case "clear-images":
          await makeApiCall<{ ids: string[] }>(
            `/${params.storeId}/${MODEL_MAPPING[model] || model}/clear-images`,
            "PATCH",
            {
              ids: table
                .getFilteredSelectedRowModel()
                .rows.map((row) => (row.original as { id: string }).id),
            },
          );
          router.refresh();
          toast({
            description: `${table.getFilteredSelectedRowModel().rows.length} elemento(s) ${getActionDescription(
              action,
            )}`,
            variant: "success",
          });
          table.resetRowSelection();
          break;
        case "export":
          generateCSV(table.getFilteredSelectedRowModel().rows);
          toast({
            description: `${table.getFilteredSelectedRowModel().rows.length} elemento(s) ${getActionDescription(
              action,
            )}`,
            variant: "success",
          });
          break;
        case "mark-as-created":
        case "mark-as-pending":
        case "mark-as-paid":
        case "mark-as-cancelled":
          await makeApiCall<{ ids: string[]; status: OrderStatus }>(
            pathname,
            "PATCH",
            {
              ids: table
                .getFilteredSelectedRowModel()
                .rows.map((row) => (row.original as { id: string }).id),
              status: orderStatusMap[action],
            },
          );
          router.refresh();
          toast({
            description: `${table.getFilteredSelectedRowModel().rows.length} elemento(s) ${getActionDescription(
              action,
            )}`,
            variant: "success",
          });
          table.resetRowSelection();
          break;
        case "mark-as-preparing":
        case "mark-as-shipped":
        case "mark-as-in-transit":
        case "mark-as-delivered":
        case "mark-as-returned":
          await makeApiCall<{ ids: string[]; shipping: ShippingStatus }>(
            pathname,
            "PATCH",
            {
              ids: table
                .getFilteredSelectedRowModel()
                .rows.map((row) => (row.original as { id: string }).id),
              shipping: shippingStatusMap[action],
            },
          );
          router.refresh();
          toast({
            description: `${table.getFilteredSelectedRowModel().rows.length} elemento(s) ${getActionDescription(
              action,
            )}`,
            variant: "success",
          });
          table.resetRowSelection();
          break;
      }
    } catch (error: any) {
      console.error("An error occurred while performing the action:", error);
      toast({
        description:
          "¡Ups! Algo salió mal. Por favor, verifica tu conexión e inténtalo nuevamente más tarde.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      if (open) setOpen(false);
      setAction(null);
    }
  };

  const getActionDescription = useCallback((action: Action) => {
    switch (action) {
      case "delete":
        return "eliminado(s) con éxito";
      case "archive":
        return "archivado(s) con éxito";
      case "unarchive":
        return "desarchivado(s) con éxito";
      case "feature":
        return "destacado(s) con éxito";
      case "unfeature":
        return "quitado(s) de destacados con éxito";
      case "clear-images":
        return "eliminó o eliminaron sus imágenes con éxito";
      case "export":
        return "exportado(s) con éxito";
      case "mark-as-created":
      case "mark-as-pending":
      case "mark-as-paid":
      case "mark-as-cancelled":
      case "mark-as-preparing":
      case "mark-as-shipped":
      case "mark-as-in-transit":
      case "mark-as-delivered":
      case "mark-as-returned":
        return "cambiado(s) con éxito";
      default:
        return "acción no soportada";
    }
  }, []);

  const generateCSV = useCallback(
    (rows: any[]) => {
      const columnsDefs = ModelsColumns[model];
      const keys = Object.keys(columnsDefs);
      const displayNames = Object.values(columnsDefs);
      const headers = displayNames.join(",");
      const rowsData = rows
        .map((row) =>
          keys
            .map((key) => {
              const value = row.original[key];
              return typeof value === "string" ? `"${value}"` : value;
            })
            .join(","),
        )
        .join("\n");
      const csvContent = `${headers}\n${rowsData}`;

      const blob = new Blob([csvContent], {
        type: "text/csv;charset=utf-8;",
      });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);

      link.setAttribute("href", url);
      link.setAttribute("download", `export-${model}-${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();

      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
    [model],
  );

  useEffect(() => {
    if (action) {
      setOpen(true);
    }
  }, [action]);

  return (
    <>
      <AlertModal
        isOpen={open}
        onClose={() => {
          setAction(null);
          setOpen(false);
        }}
        onConfirm={() => handleAction(action as Action)}
        loading={isLoading}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {isLoading ? (
            <Button variant="outline" className="ml-auto" disabled>
              <Loader className="h-4 w-4 animate-spin" />
              <span className="sr-only">Ejecutando operación...</span>
            </Button>
          ) : (
            <Button
              variant="outline"
              className="ml-auto"
              disabled={
                table.getFilteredSelectedRowModel().rows.length === 0 ||
                isLoading
              }
            >
              Acciones <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>
            Filas seleccionadas:{" "}
            {table.getFilteredSelectedRowModel().rows.length}
          </DropdownMenuLabel>
          {routeActions.length > 0 && <DropdownMenuSeparator />}
          {routeActions.includes("delete") && (
            <DropdownMenuItem
              className={cn(
                "flex cursor-pointer items-center justify-between",
                {
                  "cursor-wait": isLoading,
                },
              )}
              onClick={() => setAction("delete")}
            >
              Eliminar
              <Trash className="h-4 w-4" />
            </DropdownMenuItem>
          )}
          {routeActions.includes("archive") && (
            <DropdownMenuItem
              className={cn(
                "flex cursor-pointer items-center justify-between",
                {
                  "cursor-wait": isLoading,
                },
              )}
              onClick={() => handleAction("archive")}
            >
              Archivar
              <Archive className="h-4 w-4" />
            </DropdownMenuItem>
          )}
          {routeActions.includes("unarchive") && (
            <DropdownMenuItem
              className={cn(
                "flex cursor-pointer items-center justify-between",
                {
                  "cursor-wait": isLoading,
                },
              )}
              onClick={() => handleAction("unarchive")}
            >
              Desarchivar
              <ArchiveRestore className="h-4 w-4" />
            </DropdownMenuItem>
          )}
          {routeActions.includes("export") && (
            <DropdownMenuItem
              className={cn(
                "flex cursor-pointer items-center justify-between",
                {
                  "cursor-wait": isLoading,
                },
              )}
              onClick={() => handleAction("export")}
            >
              Exportar
              <Download className="h-4 w-4" />
            </DropdownMenuItem>
          )}
          {routeActions.includes("feature") && (
            <DropdownMenuItem
              className={cn(
                "flex cursor-pointer items-center justify-between",
                {
                  "cursor-wait": isLoading,
                },
              )}
              onClick={() => handleAction("feature")}
            >
              Destacar
              <Star className="h-4 w-4" />
            </DropdownMenuItem>
          )}
          {routeActions.includes("unfeature") && (
            <DropdownMenuItem
              className={cn(
                "flex cursor-pointer items-center justify-between",
                {
                  "cursor-wait": isLoading,
                },
              )}
              onClick={() => handleAction("unfeature")}
            >
              Quitar destacado
              <StarOff className="h-4 w-4" />
            </DropdownMenuItem>
          )}
          {routeActions.includes("clear-images") && (
            <DropdownMenuItem
              className={cn(
                "flex cursor-pointer items-center justify-between",
                {
                  "cursor-wait": isLoading,
                },
              )}
              onClick={() => setAction("clear-images")}
            >
              Eliminar imágenes
              <ImageOff className="h-4 w-4" />
            </DropdownMenuItem>
          )}
          {model === Models.Orders && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Estado de la orden</DropdownMenuLabel>
              <DropdownMenuItem
                className={cn(
                  "flex cursor-pointer items-center justify-between",
                  {
                    "cursor-wait": isLoading,
                  },
                )}
                onClick={() => handleAction("mark-as-created")}
              >
                Creada
                <span>📖</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className={cn(
                  "flex cursor-pointer items-center justify-between",
                  {
                    "cursor-wait": isLoading,
                  },
                )}
                onClick={() => handleAction("mark-as-pending")}
              >
                Pendiente
                <span>⌛</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className={cn(
                  "flex cursor-pointer items-center justify-between",
                  {
                    "cursor-wait": isLoading,
                  },
                )}
                onClick={() => handleAction("mark-as-paid")}
              >
                Pagada
                <span>💵</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className={cn(
                  "flex cursor-pointer items-center justify-between",
                  {
                    "cursor-wait": isLoading,
                  },
                )}
                onClick={() => handleAction("mark-as-cancelled")}
              >
                Cancelada
                <span>🚫</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Estado del envío</DropdownMenuLabel>
              <DropdownMenuItem
                className={cn(
                  "flex cursor-pointer items-center justify-between",
                  {
                    "cursor-wait": isLoading,
                  },
                )}
                onClick={() => handleAction("mark-as-preparing")}
              >
                En preparación
                <span>📦</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className={cn(
                  "flex cursor-pointer items-center justify-between",
                  {
                    "cursor-wait": isLoading,
                  },
                )}
                onClick={() => handleAction("mark-as-shipped")}
              >
                Enviada
                <span>🚀</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className={cn(
                  "flex cursor-pointer items-center justify-between",
                  {
                    "cursor-wait": isLoading,
                  },
                )}
                onClick={() => handleAction("mark-as-in-transit")}
              >
                En tránsito
                <span>⛟</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className={cn(
                  "flex cursor-pointer items-center justify-between",
                  {
                    "cursor-wait": isLoading,
                  },
                )}
                onClick={() => handleAction("mark-as-delivered")}
              >
                Entregada
                <span>🏠</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className={cn(
                  "flex cursor-pointer items-center justify-between",
                  {
                    "cursor-wait": isLoading,
                  },
                )}
                onClick={() => handleAction("mark-as-returned")}
              >
                Retornado
                <span>🚫</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
