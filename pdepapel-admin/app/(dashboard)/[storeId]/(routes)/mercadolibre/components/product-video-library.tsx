"use client";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { env } from "@/lib/env.mjs";
import {
  ExternalLink,
  Loader2,
  Trash2,
  UploadCloud,
  Video,
} from "lucide-react";
import { CldUploadWidget } from "next-cloudinary";
import { useCallback, useEffect, useState } from "react";

type ProductVideo = {
  id: string;
  url: string;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  isPrimary: boolean;
};

type CloudinaryVideo = {
  secure_url?: unknown;
  public_id?: unknown;
  format?: unknown;
  duration?: unknown;
  width?: unknown;
  height?: unknown;
  bytes?: unknown;
};

function getErrorMessage(response: Response) {
  return response
    .json()
    .then(
      (body: { error?: string }) =>
        body.error ?? "No fue posible completar la acción",
    )
    .catch(() => "No fue posible completar la acción");
}

export function ProductVideoLibrary({
  storeId,
  productId,
  marketplaceUploadUrl,
}: {
  storeId: string;
  productId: string;
  marketplaceUploadUrl?: string | null;
}) {
  const { toast } = useToast();
  const [videos, setVideos] = useState<ProductVideo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadVideos = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/${storeId}/products/${productId}/videos`,
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      setVideos((await response.json()) as ProductVideo[]);
    } catch (error) {
      toast({
        description:
          error instanceof Error
            ? error.message
            : "No fue posible cargar los videos",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [productId, storeId, toast]);

  useEffect(() => {
    void loadVideos();
  }, [loadVideos]);

  const saveUploadedVideo = async (result: unknown) => {
    const info = (result as { info?: CloudinaryVideo }).info;
    if (!info || typeof info.secure_url !== "string") return;
    setIsSaving(true);
    try {
      const response = await fetch(
        `/api/${storeId}/products/${productId}/videos`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: info.secure_url,
            cloudinaryId:
              typeof info.public_id === "string" ? info.public_id : null,
            format: info.format,
            durationSeconds: info.duration,
            width: info.width,
            height: info.height,
            bytes: info.bytes,
            isPrimary: true,
          }),
        },
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      await loadVideos();
      toast({ description: "Video guardado para este producto." });
    } catch (error) {
      toast({
        description:
          error instanceof Error
            ? error.message
            : "No fue posible guardar el video",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const deleteVideo = async (video: ProductVideo) => {
    if (!window.confirm("¿Eliminar este video de la biblioteca del producto?"))
      return;
    setDeletingId(video.id);
    try {
      const response = await fetch(
        `/api/${storeId}/products/${productId}/videos/${video.id}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error(await getErrorMessage(response));
      await loadVideos();
    } catch (error) {
      toast({
        description:
          error instanceof Error
            ? error.message
            : "No fue posible eliminar el video",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="grid gap-3 rounded-md border bg-muted/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium">
            <Video className="h-4 w-4" /> Biblioteca de videos
          </p>
          <p className="text-xs text-muted-foreground">
            Guarda un video vertical listo para revisar y subir manualmente a
            Mercado Libre. No se publica automáticamente.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CldUploadWidget
            uploadPreset="u0dp1v1y"
            onSuccess={saveUploadedVideo}
            options={{
              resourceType: "video",
              sources: ["local", "camera"],
              clientAllowedFormats: ["mp4", "mov", "mpeg", "avi"],
              maxVideoFileSize: 280 * 1024 * 1024,
              ...(env.NEXT_PUBLIC_CLOUDINARY_FOLDER_NAME
                ? { folder: env.NEXT_PUBLIC_CLOUDINARY_FOLDER_NAME }
                : {}),
            }}
          >
            {({ open }) => (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isSaving || !open}
                onClick={() => open()}
              >
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <UploadCloud className="mr-2 h-4 w-4" />
                )}
                Cargar video
              </Button>
            )}
          </CldUploadWidget>
          {marketplaceUploadUrl ? (
            <Button asChild type="button" size="sm">
              <a href={marketplaceUploadUrl} target="_blank" rel="noreferrer">
                Abrir cargador de Mercado Libre
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Requisitos para esta biblioteca: vertical, 10–61 segundos, mínimo 360 px
        de ancho y máximo 280 MB.
      </p>
      {marketplaceUploadUrl ? (
        <p className="text-xs text-muted-foreground">
          Después de guardar el clip, ábrelo en Mercado Libre y termina la carga
          allí. P de Papel no lo publica automáticamente.
        </p>
      ) : null}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando videos…</p>
      ) : videos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay videos preparados para este producto.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {videos.map((video) => (
            <div key={video.id} className="rounded-md border bg-background p-2">
              <video
                className="aspect-[9/16] w-full rounded bg-black object-contain"
                controls
                preload="metadata"
                src={video.url}
              />
              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                <span>
                  {video.durationSeconds
                    ? `${Math.round(video.durationSeconds)} s`
                    : "Video"}
                  {video.isPrimary ? " · Principal" : ""}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void deleteVideo(video)}
                  disabled={deletingId === video.id}
                >
                  {deletingId === video.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
