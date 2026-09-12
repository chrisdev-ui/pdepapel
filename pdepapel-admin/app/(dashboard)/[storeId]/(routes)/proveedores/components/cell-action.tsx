"use client";

import axios from "axios";
import { Edit, MoreHorizontal, PackageSearch, Trash } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Models } from "@/constants";
import { useActionConfirmation } from "@/hooks/use-action-confirmation";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import {
  describeSupplierReferences,
  supplierHasReferences,
  type SupplierRow,
} from "@/lib/suppliers";

interface CellActionProps {
  data: SupplierRow;
}

export const CellAction: React.FC<CellActionProps> = ({ data }) => {
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const { requestConfirmation, confirmationDialog } = useActionConfirmation();
  const [loading, setLoading] = useState(false);
  const storeId = String(params.storeId);
  const blocked = supplierHasReferences(data.usage);

  const onDelete = async () => {
    const confirmed = await requestConfirmation({
      title: `¿Eliminar el proveedor «${data.name}»?`,
      description:
        "Ningún producto ni pedido de aprovisionamiento lo referencia, así que se elimina de inmediato. Esta acción no se puede deshacer.",
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      setLoading(true);
      await axios.delete(`/api/${storeId}/${Models.Suppliers}/${data.id}`);
      router.refresh();
      toast({ description: "Proveedor eliminado.", variant: "success" });
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {confirmationDialog}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Acciones del proveedor ${data.name}`}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-w-xs">
          <DropdownMenuLabel>Acciones</DropdownMenuLabel>
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() =>
              router.push(`/${storeId}/${Models.Suppliers}/${data.id}`)
            }
          >
            <Edit className="mr-2 h-4 w-4" aria-hidden="true" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() =>
              router.push(`/${storeId}/aprovisionamiento?proveedor=${data.id}`)
            }
          >
            <PackageSearch className="mr-2 h-4 w-4" aria-hidden="true" />
            Ver pedidos
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="cursor-pointer"
            disabled={loading || blocked}
            onClick={() => void onDelete()}
          >
            <Trash className="mr-2 h-4 w-4" aria-hidden="true" />
            Eliminar
          </DropdownMenuItem>
          {blocked && (
            <p className="px-2 pb-1.5 text-xs text-muted-foreground">
              No se puede eliminar: {describeSupplierReferences(data.usage)}.
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
