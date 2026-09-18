import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { env } from "@/lib/env.mjs";
import { cn } from "@/lib/utils";
import axios from "axios";
import { ImagePlus, Star, Trash, Undo2 } from "lucide-react";
import { CldUploadWidget } from "next-cloudinary";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type Image = { url: string; isMain?: boolean };

interface ImageUploadProps {
  disabled?: boolean;
  onChange: (value: Image[]) => void;
  /** Borrado inmediato en Cloudinary (formularios sin borrado diferido). */
  onRemove?: (value: string) => void;
  value: Image[];
  /**
   * Borrado diferido: la papelera solo marca la foto y el archivo se elimina
   * al guardar. Con `onMarkRemoval` presente no se llama a Cloudinary aquí.
   */
  pendingRemovals?: string[];
  onMarkRemoval?: (url: string) => void;
  onUndoRemoval?: (url: string) => void;
  /** Tope de fotos; al alcanzarlo se oculta el botón de subir. */
  maxImages?: number;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({
  disabled,
  onChange,
  onRemove,
  value,
  pendingRemovals = [],
  onMarkRemoval,
  onUndoRemoval,
  maxImages,
}) => {
  const [isMounted, setIsMounted] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const params = useParams();
  const deferred = Boolean(onMarkRemoval);
  const pending = new Set(pendingRemovals);

  // DERIVED STATE: No need for useEffect synchronization
  const mainImage = value.find((img) => img.isMain);
  const mainImageUrl = mainImage?.url;
  const liveCount = value.filter((image) => !pending.has(image.url)).length;
  const atLimit = typeof maxImages === "number" && liveCount >= maxImages;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const onUpload = (result: any) => {
    const newImage = {
      url: result.info.secure_url,
      isMain: value.length === 0,
    };
    const updatedImages = [...value, newImage];
    onChange(updatedImages);
  };

  const handleRemove = async (url: string) => {
    if (deferred) {
      onMarkRemoval?.(url);
      return;
    }
    try {
      setIsDeleting(true);
      await axios.post(`/api/${params.storeId}/cloudinary`, { imageUrl: url });

      // Calculate new state immediately
      let filteredImages = value.filter((image) => image.url !== url);

      // If we deleted the Main image, promote the first available one
      const wasMain = value.find((img) => img.url === url)?.isMain;
      if (wasMain && filteredImages.length > 0) {
        filteredImages[0] = { ...filteredImages[0], isMain: true };
      }

      onChange(filteredImages);
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      onRemove?.(url);
    }
  };

  const handleSelectMainImage = (url: string) => {
    const updatedImages = value.map((image) => ({
      ...image,
      isMain: image.url === url,
    }));
    onChange(updatedImages);
  };

  if (!isMounted) {
    return null;
  }

  return (
    <div>
      {value.length > 0 && (
        <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {value.map((image) => {
            const isPending = pending.has(image.url);
            const isMain = image.url === mainImageUrl;
            return (
              <li
                key={image.url}
                className={cn(
                  "relative aspect-square overflow-hidden rounded-md border bg-muted",
                  isMain && !isPending && "ring-2 ring-primary ring-offset-2",
                )}
              >
                <Image
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                  className={cn("object-cover", isPending && "opacity-40 grayscale")}
                  alt=""
                  src={image.url}
                />
                {isPending ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-2 text-center">
                    <span className="rounded-full bg-tint-pink px-2 py-0.5 text-[11px] font-semibold text-primary">
                      Se quita al guardar
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={disabled}
                      onClick={() => onUndoRemoval?.(image.url)}
                    >
                      <Undo2 className="h-4 w-4" aria-hidden="true" />
                      Deshacer
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="absolute right-2 top-2 z-10">
                      <Button
                        type="button"
                        onClick={() => handleRemove(image.url)}
                        variant="destructive"
                        size="icon-sm"
                        disabled={disabled}
                        aria-label={deferred ? "Quitar foto al guardar" : "Eliminar foto"}
                      >
                        <Trash className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                    <div className="absolute left-2 top-2 z-10">
                      <Button
                        type="button"
                        onClick={() => handleSelectMainImage(image.url)}
                        variant="ghost"
                        size="icon-sm"
                        disabled={disabled}
                        aria-label={isMain ? "Foto principal" : "Usar como foto principal"}
                        aria-pressed={isMain}
                        className={cn("bg-white/90 hover:bg-white", isMain && "bg-yellow-100 hover:bg-yellow-200")}
                      >
                        <Star
                          className={cn("h-4 w-4", isMain ? "fill-yellow-500 text-yellow-500" : "text-gray-500")}
                          aria-hidden="true"
                        />
                      </Button>
                    </div>
                    {isMain && (
                      <span className="absolute bottom-2 left-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                        Principal
                      </span>
                    )}
                  </>
                )}
                {isDeleting && (
                  <div className="absolute left-0 top-0 flex h-full w-full items-center justify-center backdrop-brightness-50">
                    <span className="animate-pulse text-xs text-white">Eliminando...</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <CldUploadWidget
        onUpload={onUpload}
        uploadPreset="u0dp1v1y"
        options={{
          // El widget reduce la foto en el navegador antes de subirla, así el
          // original guardado en Cloudinary nunca supera 2000 px por lado
          // (una foto de celular de 3024×4032 pesaba ~3 MB). Ver
          // docs/imagenes-cloudinary.md.
          maxImageWidth: 2000,
          maxImageHeight: 2000,
          ...(env.NEXT_PUBLIC_CLOUDINARY_FOLDER_NAME
            ? { folder: env.NEXT_PUBLIC_CLOUDINARY_FOLDER_NAME }
            : {}),
        }}
      >
        {({ open }) => {
          const onClick = (
            e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
          ) => {
            e.preventDefault();
            open();
          };
          if (!open) {
            return <div>Cargando...</div>;
          }
          return (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                disabled={disabled || atLimit}
                variant="secondary"
                onClick={onClick}
              >
                <ImagePlus className="mr-2 h-4 w-4" aria-hidden="true" />
                Cargar una imagen
              </Button>
              {typeof maxImages === "number" && (
                <span className="text-xs text-muted-foreground">
                  {atLimit ? `Máximo ${maxImages} fotos.` : `Hasta ${maxImages} fotos, JPG, PNG o WebP.`}
                </span>
              )}
            </div>
          );
        }}
      </CldUploadWidget>
    </div>
  );
};
