import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { env } from "@/lib/env.mjs";
import { cn } from "@/lib/utils";
import axios from "axios";
import { ImagePlus, Star, Trash } from "lucide-react";
import { CldUploadWidget } from "next-cloudinary";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type Image = { url: string; isMain?: boolean };

interface ImageUploadProps {
  disabled?: boolean;
  onChange: (value: Image[]) => void;
  onRemove: (value: string) => void;
  onSelectMainImage?: (value: string) => void;
  value: Image[];
}

export const ImageUpload: React.FC<ImageUploadProps> = ({
  disabled,
  onChange,
  onRemove,
  onSelectMainImage,
  value,
}) => {
  const [isMounted, setIsMounted] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const params = useParams();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const onUpload = (result: any) => {
    onChange([...value, { url: result.info.secure_url, isMain: false }]);
  };

  const handleRemove = async (url: string) => {
    try {
      setIsDeleting(true);
      await axios.post(`/api/${params.storeId}/cloudinary`, { imageUrl: url });
    } catch (error) {
      toast({
        description:
          "¡Ups! Algo salió mal. Por favor, verifica tu conexión e inténtalo nuevamente más tarde.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      onRemove(url);
    }
  };

  const handleSelectMainImage = (url: string) => {
    const updatedImages = value.map((image) => ({
      ...image,
      isMain: image.url === url,
    }));
    onChange(updatedImages);
    onSelectMainImage?.(url);
  };

  if (!isMounted) {
    return null;
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-4">
        {value.map((image) => (
          <div
            key={image.url}
            className="relative h-[200px] w-[200px] overflow-hidden rounded-md"
          >
            <div className="absolute right-2 top-2 z-10">
              <Button
                type="button"
                onClick={() => handleRemove(image.url)}
                variant="destructive"
                size="icon"
              >
                <Trash className="h-4 w-4" />
              </Button>
            </div>
            <Image
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-cover"
              alt="Image"
              src={image.url}
            />
            <div className="absolute left-2 top-2 z-10">
              <Button
                type="button"
                onClick={() => handleSelectMainImage(image.url)}
                variant="ghost"
                size="icon"
              >
                <Star
                  className={cn("h-4 w-4", {
                    "text-yellow-star": image.isMain,
                  })}
                />
              </Button>
            </div>
            {isDeleting && (
              <div className="absolute left-0 top-0 flex h-full w-full items-center justify-center backdrop-brightness-50">
                <span className="animate-pulse text-xs text-white backdrop-brightness-50">
                  Eliminando...
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
      <CldUploadWidget
        onUpload={onUpload}
        uploadPreset="u0dp1v1y"
        options={
          env.NEXT_PUBLIC_CLOUDINARY_FOLDER_NAME
            ? {
                folder: env.NEXT_PUBLIC_CLOUDINARY_FOLDER_NAME,
              }
            : {}
        }
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
            <Button
              type="button"
              disabled={disabled}
              variant="secondary"
              onClick={onClick}
            >
              <ImagePlus className="mr-2 h-4 w-4" />
              Cargar una imagen
            </Button>
          );
        }}
      </CldUploadWidget>
    </div>
  );
};
