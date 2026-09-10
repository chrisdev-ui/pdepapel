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
import { getErrorMessage } from "@/lib/api-errors";
import { getDashboardApiRoute } from "@/lib/dashboard-api-routes";
import { cn } from "@/lib/utils";
import { OrderStatus, ShippingStatus } from "@prisma/client";
import { Table } from "@tanstack/react-table";
import {
  Archive,
  ArchiveRestore,
  Ban,
  ChevronDown,
  Download,
  ImageOff,
  Loader,
  Star,
  StarOff,
  Trash,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
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
  | "mark-as-pending"
  | "mark-as-paid"
  | "mark-as-cancelled"
  | "mark-as-preparing"
  | "mark-as-shipped"
  | "mark-as-in-transit"
  | "mark-as-delivered"
  | "mark-as-returned"
  | "invalidate";

interface DataTableActionOptionsProps<TData> {
  table: Table<TData>;
  model: Models;
}

const orderStatusMap: Record<
  Extract<
    Action,
    "mark-as-pending" | "mark-as-paid" | "mark-as-cancelled"
  >,
  OrderStatus
> = {
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

export function DataTableActionOptions<TData>({
  table,
  model,
}: DataTableActionOptionsProps<TData>) {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<Action | null>(null);

  const routeActions: Action[] = useMemo(() => {
    switch (model) {
      // Productos tiene su propio menu en lote (`ProductBulkActions`), con
      // confirmaciones honestas y expansion de grupo explicita. Esta rama
      // quedo inalcanzable al pasarle `bulkActions` a la tabla, y ofrecia
      // archivar/destacar SIN confirmacion contra un PATCH que ya no existe.
      // `agotados` y `stock-bajo` ahora redirigen a Inventario.
      case Models.Products:
      case Models.LowStock:
      case Models.OutOfStock:
      case Models.Inventory:
      case Models.SalesByCategory:
        return [];
      case Models.Orders:
        return [
          "delete",
          "export",
          "mark-as-pending",
          "mark-as-paid",
          "mark-as-cancelled",
          "mark-as-preparing",
          "mark-as-shipped",
          "mark-as-in-transit",
          "mark-as-delivered",
          "mark-as-returned",
        ];
      case Models.Coupons:
        return ["delete", "invalidate", "export"];
      default:
        return ["delete", "export"];
    }
  }, [model]);

  const handleAction = async (action: Action) => {
    setIsLoading(true);
    try {
      const apiRoute = getDashboardApiRoute(params.storeId as string, model);

      switch (action) {
        case "delete":
          await makeApiCall<{ ids: string[] }>(
            apiRoute,
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
          }>(apiRoute, "PATCH", {
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
          }>(apiRoute, "PATCH", {
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
            `${apiRoute}/clear-images`,
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
        case "mark-as-pending":
        case "mark-as-paid":
        case "mark-as-cancelled":
          await makeApiCall<{ ids: string[]; status: OrderStatus }>(
            apiRoute,
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
            apiRoute,
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
        case "invalidate":
          await makeApiCall<{ ids: string[] }>(
            apiRoute,
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
      }
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      if (open) setOpen(false);
      setAction(null);
    }
  };

  /**
   * Cada acción masiva confirma con lo que realmente va a pasar. Antes todas
   * mostraban «¿Eliminar de forma definitiva?», incluso marcar como pagada.
   */
  const confirmCopy = useCallback(
    (
      action: Action | null,
      count: number,
    ): { title: string; description: string; confirmLabel: string; destructive: boolean } => {
      const n = `${count} ${count === 1 ? "pedido" : "pedidos"}`;
      const one = count === 1;
      switch (action) {
        case "mark-as-paid":
          return {
            title: `¿Marcar ${n} como ${one ? "pagado" : "pagados"}?`,
            description:
              "Se descuenta el inventario de cada producto, queda un movimiento en el kardex y se fija la fecha de pago de hoy, así que contarán en las ventas y en los reportes tributarios. Cada cliente recibe un correo de pago confirmado. Revisa los comprobantes antes de confirmar: no se pide una referencia por pedido.",
            confirmLabel: one ? "Sí, marcar como pagado" : "Sí, marcar como pagados",
            destructive: false,
          };
        case "mark-as-cancelled":
          return {
            title: `¿Cancelar ${n}?`,
            description:
              one
              ? "Si estaba pagado, su inventario vuelve con un movimiento de cancelación y su cupón se libera. El cliente recibe un correo de cancelación."
              : "Los que estaban pagados devuelven su inventario con un movimiento de cancelación y liberan su cupón. Cada cliente recibe un correo de cancelación.",
            confirmLabel: "Sí, cancelar",
            destructive: true,
          };
        case "mark-as-pending":
          return {
            title: `¿Dejar ${n} ${one ? "pendiente" : "pendientes"} de pago?`,
            description:
              one
              ? "Queda a la espera del pago del cliente. No se toca el inventario."
              : "Quedan a la espera del pago del cliente. No se toca el inventario.",
            confirmLabel: one ? "Sí, dejar pendiente" : "Sí, dejar pendientes",
            destructive: false,
          };
        case "mark-as-preparing":
        case "mark-as-shipped":
        case "mark-as-in-transit":
        case "mark-as-delivered":
        case "mark-as-returned":
          return {
            title: `¿Cambiar el envío de ${n}?`,
            description:
              "Se actualiza el estado del envío y cada cliente recibe el aviso por correo. Los pedidos sin envío registrado no se pueden cambiar así.",
            confirmLabel: "Sí, cambiar el envío",
            destructive: false,
          };
        case "delete":
          return {
            title: `¿Eliminar ${count} ${count === 1 ? "elemento" : "elementos"} de forma definitiva?`,
            description:
              model === Models.Orders
                ? "Esta acción no se puede deshacer. Los pedidos pagados devuelven su inventario con un movimiento."
                : "Esta acción no se puede deshacer.",
            confirmLabel: "Sí, eliminar",
            destructive: true,
          };
        case "export":
          return {
            title: `¿Exportar ${count} ${count === 1 ? "fila" : "filas"}?`,
            description: "Se descarga un archivo CSV con las columnas visibles.",
            confirmLabel: "Descargar CSV",
            destructive: false,
          };
        default:
          return {
            title: "¿Aplicar el cambio?",
            description: "Se aplicará a las filas seleccionadas.",
            confirmLabel: "Sí, continuar",
            destructive: false,
          };
      }
    },
    [model],
  );

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
      case "mark-as-pending":
      case "mark-as-paid":
      case "mark-as-cancelled":
      case "mark-as-preparing":
      case "mark-as-shipped":
      case "mark-as-in-transit":
      case "mark-as-delivered":
      case "mark-as-returned":
        return "cambiado(s) con éxito";
      case "invalidate":
        return "invalidado(s) con éxito";
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
        {...confirmCopy(action, table.getFilteredSelectedRowModel().rows.length)}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {isLoading ? (
            <Button variant="outline" className="ml-auto" disabled>
              <Loader className="h-4 w-4 animate-spin" aria-hidden="true" />
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
              Acciones <ChevronDown className="ml-2 h-4 w-4" aria-hidden="true" />
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
                "cursor-pointer",
                {
                  "cursor-wait": isLoading,
                },
              )}
              onClick={() => setAction("delete")}
            >
              Eliminar
              <Trash className="h-4 w-4" aria-hidden="true" />
            </DropdownMenuItem>
          )}
          {routeActions.includes("archive") && (
            <DropdownMenuItem
              className={cn(
                "cursor-pointer",
                {
                  "cursor-wait": isLoading,
                },
              )}
              onClick={() => handleAction("archive")}
            >
              Archivar
              <Archive className="h-4 w-4" aria-hidden="true" />
            </DropdownMenuItem>
          )}
          {routeActions.includes("unarchive") && (
            <DropdownMenuItem
              className={cn(
                "cursor-pointer",
                {
                  "cursor-wait": isLoading,
                },
              )}
              onClick={() => handleAction("unarchive")}
            >
              Desarchivar
              <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
            </DropdownMenuItem>
          )}
          {routeActions.includes("export") && (
            <DropdownMenuItem
              className={cn(
                "cursor-pointer",
                {
                  "cursor-wait": isLoading,
                },
              )}
              onClick={() => handleAction("export")}
            >
              Exportar
              <Download className="h-4 w-4" aria-hidden="true" />
            </DropdownMenuItem>
          )}
          {routeActions.includes("feature") && (
            <DropdownMenuItem
              className={cn(
                "cursor-pointer",
                {
                  "cursor-wait": isLoading,
                },
              )}
              onClick={() => handleAction("feature")}
            >
              Destacar
              <Star className="h-4 w-4" aria-hidden="true" />
            </DropdownMenuItem>
          )}
          {routeActions.includes("unfeature") && (
            <DropdownMenuItem
              className={cn(
                "cursor-pointer",
                {
                  "cursor-wait": isLoading,
                },
              )}
              onClick={() => handleAction("unfeature")}
            >
              Quitar destacado
              <StarOff className="h-4 w-4" aria-hidden="true" />
            </DropdownMenuItem>
          )}
          {routeActions.includes("clear-images") && (
            <DropdownMenuItem
              className={cn(
                "cursor-pointer",
                {
                  "cursor-wait": isLoading,
                },
              )}
              onClick={() => setAction("clear-images")}
            >
              Eliminar imágenes
              <ImageOff className="h-4 w-4" aria-hidden="true" />
            </DropdownMenuItem>
          )}
          {routeActions.includes("invalidate") && (
            <DropdownMenuItem
              className={cn(
                "cursor-pointer",
                {
                  "cursor-wait": isLoading,
                },
              )}
              onClick={() => setAction("invalidate")}
            >
              Invalidar
              <Ban className="h-4 w-4" aria-hidden="true" />
            </DropdownMenuItem>
          )}
          {model === Models.Orders && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Estado de la orden</DropdownMenuLabel>
              <DropdownMenuItem
                className={cn(
                  "cursor-pointer",
                  {
                    "cursor-wait": isLoading,
                  },
                )}
                onClick={() => setAction("mark-as-pending")}
              >
                Pendiente
              </DropdownMenuItem>
              <DropdownMenuItem
                className={cn(
                  "cursor-pointer",
                  {
                    "cursor-wait": isLoading,
                  },
                )}
                onClick={() => setAction("mark-as-paid")}
              >
                Pagada
              </DropdownMenuItem>
              <DropdownMenuItem
                className={cn(
                  "cursor-pointer",
                  {
                    "cursor-wait": isLoading,
                  },
                )}
                onClick={() => setAction("mark-as-cancelled")}
              >
                Cancelada
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Estado del envío</DropdownMenuLabel>
              <DropdownMenuItem
                className={cn(
                  "cursor-pointer",
                  {
                    "cursor-wait": isLoading,
                  },
                )}
                onClick={() => setAction("mark-as-preparing")}
              >
                En preparación
              </DropdownMenuItem>
              <DropdownMenuItem
                className={cn(
                  "cursor-pointer",
                  {
                    "cursor-wait": isLoading,
                  },
                )}
                onClick={() => setAction("mark-as-shipped")}
              >
                Enviada
              </DropdownMenuItem>
              <DropdownMenuItem
                className={cn(
                  "cursor-pointer",
                  {
                    "cursor-wait": isLoading,
                  },
                )}
                onClick={() => setAction("mark-as-in-transit")}
              >
                En tránsito
              </DropdownMenuItem>
              <DropdownMenuItem
                className={cn(
                  "cursor-pointer",
                  {
                    "cursor-wait": isLoading,
                  },
                )}
                onClick={() => setAction("mark-as-delivered")}
              >
                Entregada
              </DropdownMenuItem>
              <DropdownMenuItem
                className={cn(
                  "cursor-pointer",
                  {
                    "cursor-wait": isLoading,
                  },
                )}
                onClick={() => setAction("mark-as-returned")}
              >
                Retornado
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
