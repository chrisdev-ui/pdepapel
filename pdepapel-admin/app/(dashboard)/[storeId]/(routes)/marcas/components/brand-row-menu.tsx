"use client";

import axios from "axios";
import { Archive, ArchiveRestore, Edit, Eye, GitMerge, MoreHorizontal, Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useCanWrite } from "@/components/shell/viewer-access";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActionConfirmation } from "@/hooks/use-action-confirmation";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { brandsApi, mergeCandidates, plural } from "@/lib/brand-admin";

import type { BrandRow } from "../server/get-brands";
import { MergeBrandDialog } from "./merge-brand-dialog";

interface BrandRowMenuProps {
  storeId: string;
  brand: BrandRow;
  brands: BrandRow[];
}

export function BrandRowMenu({ storeId, brand, brands }: BrandRowMenuProps) {
  const router = useRouter();
  const { toast } = useToast();
  const canWrite = useCanWrite();
  const { requestConfirmation, confirmationDialog } = useActionConfirmation();
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const deletable = brand.totalProducts === 0 && brand.groups === 0 && brand.lines === 0;
  const hasMergeTarget = mergeCandidates(brand, brands).length > 0;

  const setArchived = async (isArchived: boolean) => {
    if (isArchived) {
      const confirmed = await requestConfirmation({
        title: `¿Archivar «${brand.name}»?`,
        description:
          "Deja de verse en la tienda y en los selectores. Sus productos conservan la marca y su página responde «no encontrada». Puedes desarchivarla después.",
        confirmLabel: "Archivar",
      });
      if (!confirmed) return;
    }
    try {
      setLoading(true);
      await axios.post(`${brandsApi(storeId)}/${brand.id}/archive`, { isArchived });
      toast({ description: isArchived ? `${brand.name} archivada.` : `${brand.name} desarchivada.`, variant: "success" });
      router.refresh();
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async () => {
    const confirmed = await requestConfirmation({
      title: `¿Eliminar la marca «${brand.name}»?`,
      description: "No tiene productos, así que se elimina de inmediato. No se puede deshacer.",
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      setLoading(true);
      await axios.delete(`${brandsApi(storeId)}/${brand.id}`);
      toast({ description: "Marca eliminada.", variant: "success" });
      router.refresh();
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {confirmationDialog}
      {merging && (
        <MergeBrandDialog storeId={storeId} source={brand} brands={brands} open onOpenChange={setMerging} />
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Acciones de la marca ${brand.name}`}>
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-w-xs">
          <DropdownMenuItem
            className="min-h-11 cursor-pointer"
            onClick={() => router.push(`/${storeId}/marcas/${brand.id}`)}
          >
            {canWrite ? <Edit className="mr-2 h-4 w-4" aria-hidden="true" /> : <Eye className="mr-2 h-4 w-4" aria-hidden="true" />}
            {canWrite ? "Editar" : "Ver"}
          </DropdownMenuItem>
          {canWrite && !brand.isArchived && (
            <DropdownMenuItem
              className="min-h-11 cursor-pointer"
              disabled={loading || !hasMergeTarget}
              onClick={() => setMerging(true)}
            >
              <GitMerge className="mr-2 h-4 w-4" aria-hidden="true" />
              Fusionar con otra marca…
            </DropdownMenuItem>
          )}
          {canWrite && (
            <DropdownMenuItem
              className="min-h-11 cursor-pointer"
              disabled={loading}
              onClick={() => void setArchived(!brand.isArchived)}
            >
              {brand.isArchived ? (
                <ArchiveRestore className="mr-2 h-4 w-4" aria-hidden="true" />
              ) : (
                <Archive className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {brand.isArchived ? "Desarchivar" : "Archivar"}
            </DropdownMenuItem>
          )}
          {canWrite && deletable && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="min-h-11 cursor-pointer" disabled={loading} onClick={() => void onDelete()}>
                <Trash className="mr-2 h-4 w-4" aria-hidden="true" />
                Eliminar
              </DropdownMenuItem>
            </>
          )}
          {canWrite && !deletable && (brand.totalProducts > 0 || brand.groups > 0) && (
            <p className="px-2 pb-1.5 pt-1 text-xs text-muted-foreground">
              Tiene{" "}
              {brand.totalProducts > 0
                ? plural(brand.totalProducts, "producto", "productos")
                : plural(brand.groups, "grupo", "grupos")}
              : no se puede eliminar. Archívala o fusiónala con otra.
            </p>
          )}
          {canWrite && brand.totalProducts === 0 && brand.groups === 0 && brand.lines > brand.activeLines && (
            <p className="px-2 pb-1.5 pt-1 text-xs text-muted-foreground">
              Tiene {plural(brand.lines - brand.activeLines, "línea archivada", "líneas archivadas")}: no se puede eliminar.
            </p>
          )}
          {canWrite && !brand.isArchived && brand.activeLines > 0 && (
            <p className="px-2 pb-1.5 pt-1 text-xs text-muted-foreground">
              Tiene {plural(brand.activeLines, "línea", "líneas")}: para archivarla, archívalas o pásalas a otra marca antes.
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
