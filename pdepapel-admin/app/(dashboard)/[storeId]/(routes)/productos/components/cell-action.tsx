"use client";

import { useCanWrite } from "@/components/shell/viewer-access";
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
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import axios from "axios";
import {
  Archive,
  ArchiveRestore,
  Copy,
  Edit,
  ExternalLink,
  Layers,
  MoreHorizontal,
  Trash,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ProductColumn } from "./columns";
import { ProductDeleteDialog } from "./product-delete-dialog";

interface CellActionProps {
  data: ProductColumn;
  /** URL pública de la tienda para «Ver en la tienda». */
  storeUrl?: string | null;
}

export const CellAction: React.FC<CellActionProps> = ({ data, storeUrl }) => {
  const canWrite = useCanWrite();
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const base = `/${params.storeId}/${Models.Products}`;

  const onCopySku = () => {
    navigator.clipboard.writeText(data.sku);
    toast({
      description: "SKU copiado al portapapeles",
      variant: "success",
    });
  };

  const toggleArchive = async () => {
    const archive = !data.isArchived;
    try {
      setLoading(true);
      const response = await axios.post<{ pausedListings: number }>(
        `/api/${params.storeId}/${Models.Products}/bulk-update`,
        { productIds: [data.id], field: "isArchived", value: archive },
      );
      toast({
        description: archive
          ? `«${data.name}» quedó archivado.${response.data.pausedListings ? " Su publicación en Mercado Libre se pausa." : ""}`
          : `«${data.name}» vuelve a estar a la venta.`,
        variant: "success",
      });
      router.refresh();
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const storeHref =
    storeUrl && data.slug && !data.isArchived
      ? `${storeUrl.replace(/\/$/, "")}/producto/${data.slug}`
      : null;

  return (
    <>
      <ProductDeleteDialog
        productId={data.id}
        productName={data.name}
        isArchived={data.isArchived}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDone={() => router.refresh()}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0" disabled={loading}>
            <span className="sr-only">Abrir menú</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate">
            {data.name}
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => router.push(`${base}/${data.id}`)}>
            <Edit className="mr-2 h-4 w-4" aria-hidden="true" />
            {canWrite ? "Editar" : "Ver"}
          </DropdownMenuItem>
          {storeHref && (
            <DropdownMenuItem asChild>
              <a href={storeHref} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                Ver en la tienda
              </a>
            </DropdownMenuItem>
          )}
          {data.productGroup && (
            <DropdownMenuItem
              onClick={() =>
                router.push(`${base}/grupo/${data.productGroup!.id}`)
              }
            >
              <Layers className="mr-2 h-4 w-4" aria-hidden="true" />
              Ir al grupo
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => router.push(`${base}/nuevo?desde=${data.id}`)}
          >
            <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
            Duplicar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onCopySku}>
            <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
            Copiar SKU
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void toggleArchive()}>
            {data.isArchived ? (
              <ArchiveRestore className="mr-2 h-4 w-4" aria-hidden="true" />
            ) : (
              <Archive className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {data.isArchived ? "Restaurar" : "Archivar"}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash className="mr-2 h-4 w-4" aria-hidden="true" />
            Eliminar…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
