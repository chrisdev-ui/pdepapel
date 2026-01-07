"use client";

import axios from "axios";
import { Loader2, Trash } from "lucide-react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";

import { AlertModal } from "@/components/modals/alert-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Heading } from "@/components/ui/heading";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface OrphanImage {
  public_id: string;
  secure_url: string;
  created_at: string;
  bytes: number;
}

interface CloudinaryResponse {
  orphans: OrphanImage[];
  stats: {
    count: number;
    totalSize: number;
    scannedCount: number;
  };
}

const fetcher = (url: string) => axios.get(url).then((res) => res.data);

export const CloudinaryClient = () => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  // Loading state for delete action only
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);

  const {
    data: response,
    error,
    isLoading,
    mutate,
  } = useSWR<CloudinaryResponse>(
    `/api/${params.storeId}/cleanup-images`,
    fetcher,
  );

  const data = response?.orphans || [];
  const stats = response?.stats || { count: 0, totalSize: 0, scannedCount: 0 };

  const onDelete = async () => {
    try {
      setDeleting(true);
      await axios.delete(`/api/${params.storeId}/cleanup-images`, {
        data: { publicIds: Array.from(selectedIds) },
      });
      toast({
        title: "Éxito",
        description: "Imágenes eliminadas correctamente",
        variant: "success",
      });
      setSelectedIds(new Set());
      mutate(); // Refresh data
    } catch (error) {
      toast({
        title: "Error",
        description: "Error eliminando imágenes",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setOpen(false);
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleAll = () => {
    if (selectedIds.size === data.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.map((item) => item.public_id)));
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-destructive">Error al cargar las imágenes.</p>
      </div>
    );
  }

  return (
    <>
      <AlertModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={onDelete}
        loading={deleting}
      />
      <div className="flex items-center justify-between">
        <Heading
          title={`Limpieza de Imágenes (${data.length})`}
          description="Gestiona y elimina imágenes huérfanas de Cloudinary"
        />
        {selectedIds.size > 0 && (
          <Button
            disabled={deleting}
            variant="destructive"
            size="sm"
            onClick={() => setOpen(true)}
          >
            <Trash className="mr-2 h-4 w-4" />
            Eliminar ({selectedIds.size})
          </Button>
        )}
      </div>
      <Separator />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-6">
            <h3 className="text-2xl font-bold">{stats.scannedCount}</h3>
            <p className="text-sm text-muted-foreground">Escaneadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-6">
            <h3 className="text-2xl font-bold">{stats.count}</h3>
            <p className="text-sm text-muted-foreground">Huérfanas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-6">
            <h3 className="text-2xl font-bold">
              {formatBytes(stats.totalSize)}
            </h3>
            <p className="text-sm text-muted-foreground">Espacio Recuperable</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2 py-4">
        <Checkbox
          checked={data.length > 0 && selectedIds.size === data.length}
          onCheckedChange={toggleAll}
          aria-label="Select all"
          disabled={isLoading}
        />
        <span className="text-sm text-muted-foreground">Seleccionar todo</span>
      </div>

      {isLoading ? (
        <div className="flex w-full items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <ScrollArea className="h-[600px] rounded-md border p-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {data.map((item) => (
              <div
                key={item.public_id}
                className="group relative aspect-square cursor-pointer overflow-hidden rounded-md border bg-muted"
                onClick={() => toggleSelect(item.public_id)}
              >
                <Image
                  fill
                  src={item.secure_url}
                  alt="Image"
                  className="object-cover transition-all group-hover:scale-110"
                />
                <div className="absolute right-2 top-2 z-10 transition-opacity">
                  <Checkbox
                    checked={selectedIds.has(item.public_id)}
                    onCheckedChange={() => toggleSelect(item.public_id)}
                    className="border-white bg-white/50 data-[state=checked]:border-primary data-[state=checked]:bg-primary"
                  />
                </div>
                <div className="absolute bottom-0 left-0 w-full bg-black/60 p-2 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <p className="truncate">
                    {format(new Date(item.created_at), "dd/MM/yyyy")}
                  </p>
                  <p>{formatBytes(item.bytes)}</p>
                </div>
                {selectedIds.has(item.public_id) && (
                  <div className="absolute inset-0 bg-primary/20" />
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </>
  );
};
