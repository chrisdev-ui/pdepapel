"use client";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { env } from "@/lib/env.mjs";
import axios from "axios";
import { ImagePlus, Trash } from "lucide-react";
import { CldUploadWidget } from "next-cloudinary";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface ImageUploadProps {
  disabled?: boolean;
  onChange: (value: string) => void;
  onRemove: (value: string) => void;
  value: string[];
}

export const ImageUpload: React.FC<ImageUploadProps> = ({
  disabled,
  onChange,
  onRemove,
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
    onChange(result.info.secure_url);
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

  if (!isMounted) {
    return null;
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-4">
        {value.map((url) => (
          <div
            key={url}
            className="relative h-[200px] w-[200px] overflow-hidden rounded-md"
          >
            <div className="absolute right-2 top-2 z-10">
              <Button
                type="button"
                onClick={() => handleRemove(url)}
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
              src={url}
            />
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
