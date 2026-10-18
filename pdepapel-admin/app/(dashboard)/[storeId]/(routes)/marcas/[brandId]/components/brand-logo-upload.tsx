"use client";

import { Trash, Upload } from "lucide-react";
import { CldUploadWidget } from "next-cloudinary";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { logoCornersHaveBackground } from "@/lib/brand-admin";
import { env } from "@/lib/env.mjs";

export interface UploadedLogo {
  url: string;
  publicId: string | null;
  width: number | null;
  height: number | null;
}

const SAMPLE_WIDTH = 256;

/**
 * Cloudinary no dice si la imagen tiene transparencia: se carga el archivo
 * original (sin f_auto, que podría quitar el alfa) y se leen las esquinas.
 * `null` cuando no se pudo leer.
 */
export function detectLogoBackground(url: string): Promise<boolean | null> {
  return new Promise((resolve) => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const ratio = image.naturalWidth > 0 ? image.naturalHeight / image.naturalWidth : 1;
        const width = Math.max(1, Math.min(SAMPLE_WIDTH, image.naturalWidth || SAMPLE_WIDTH));
        const height = Math.max(1, Math.round(width * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) return resolve(null);
        context.drawImage(image, 0, 0, width, height);
        resolve(logoCornersHaveBackground(context.getImageData(0, 0, width, height).data, width, height));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

interface BrandLogoUploadProps {
  value: string | null;
  disabled?: boolean;
  /** «Cambiar logo» / «Subir logo»; el inverso usa otro texto. */
  label: string;
  onUploaded: (logo: UploadedLogo) => void;
  onRemove: () => void;
  removeLabel: string;
}

/** Un solo archivo PNG o SVG, con el preset y la carpeta de las fotos de producto. */
export function BrandLogoUpload({ value, disabled, label, onUploaded, onRemove, removeLabel }: BrandLogoUploadProps) {
  return (
    <CldUploadWidget
      uploadPreset="u0dp1v1y"
      onUpload={(result: any) => {
        const info = result?.info;
        if (!info?.secure_url) return;
        onUploaded({
          url: info.secure_url,
          publicId: typeof info.public_id === "string" ? info.public_id : null,
          width: typeof info.width === "number" ? info.width : null,
          height: typeof info.height === "number" ? info.height : null,
        });
      }}
      options={{
        multiple: false,
        maxFiles: 1,
        // Sin maxImageWidth: reescalar en el navegador reescribe el archivo y puede quitar la transparencia.
        clientAllowedFormats: ["png", "svg"],
        ...(env.NEXT_PUBLIC_CLOUDINARY_FOLDER_NAME ? { folder: env.NEXT_PUBLIC_CLOUDINARY_FOLDER_NAME } : {}),
      }}
    >
      {({ open }) => (
        <div className="flex h-full flex-col gap-2">
          <button
            type="button"
            disabled={disabled || !open}
            onClick={(event) => {
              event.preventDefault();
              open?.();
            }}
            className="flex min-h-[9rem] flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-muted-foreground/50 bg-muted/30 p-4 text-center text-sm text-primary transition hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Upload className="h-5 w-5" aria-hidden="true" />
            <span className="font-semibold">{label}</span>
            <span className="text-muted-foreground">PNG o SVG</span>
          </button>
          {value && (
            <Button variant="ghost" size="sm" className="min-h-11 w-fit" disabled={disabled} onClick={onRemove}>
              <Trash className="mr-2 h-4 w-4" aria-hidden="true" />
              {removeLabel}
            </Button>
          )}
        </div>
      )}
    </CldUploadWidget>
  );
}

/** El logo sobre fondo claro y oscuro, como saldrá en la tienda. */
export function LogoPreview({ url, dark, caption }: { url: string; dark?: boolean; caption: string }) {
  return (
    <figure className="flex flex-col gap-1.5">
      <div
        className={
          dark
            ? "relative flex h-36 items-center justify-center rounded-xl bg-[#241B41] p-4"
            : "relative flex h-36 items-center justify-center rounded-xl border bg-white p-4"
        }
      >
        <span className="relative h-full w-full">
          <Image src={url} alt="" fill sizes="240px" className="object-contain" />
        </span>
      </div>
      <figcaption className="text-xs text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}
