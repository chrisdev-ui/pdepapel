"use client";

import { Camera, Loader2, X } from "lucide-react";
import { useId, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  PAYMENT_PROOF_MAX_BYTES_LABEL,
  PAYMENT_PROOF_MIME_TYPES,
} from "@/lib/payment-proof-key";

export interface PendingPaymentProof {
  /** Clave del objeto que devolvió el servidor; es lo que guarda la venta. */
  key: string;
  /** Vista previa local (object URL); el bucket no tiene URL pública. */
  previewUrl: string;
  name: string;
}

interface PaymentProofFieldProps {
  proof: PendingPaymentProof | null;
  uploading: boolean;
  disabled?: boolean;
  onSelect: (file: File) => void;
  onRemove: () => void;
}

/**
 * «Adjuntar comprobante» del diálogo de cobro por transferencia. Sube al
 * elegir el archivo (así la venta no espera al almacenamiento al confirmar) y
 * muestra la vista previa local; la imagen subida solo se ve luego en el
 * pedido, a través de la ruta con sesión.
 */
export function PaymentProofField({
  proof,
  uploading,
  disabled,
  onSelect,
  onRemove,
}: PaymentProofFieldProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Comprobante (opcional)</Label>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={PAYMENT_PROOF_MIME_TYPES.join(",")}
        capture="environment"
        className="sr-only"
        disabled={disabled || uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onSelect(file);
        }}
      />
      {proof ? (
        <div className="flex items-center gap-3 rounded-lg border p-2">
          {/* Vista previa local del archivo elegido; el bucket no expone ninguna URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={proof.previewUrl}
            alt="Vista previa del comprobante"
            className="h-16 w-16 shrink-0 rounded-md border object-cover"
          />
          <p className="min-w-0 flex-1 truncate text-sm">{proof.name}</p>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={onRemove}
            disabled={disabled || uploading}
            aria-label="Quitar comprobante"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="justify-start"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Camera className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          {uploading ? "Subiendo comprobante…" : "Adjuntar foto o captura"}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        Foto o captura del comprobante, hasta {PAYMENT_PROOF_MAX_BYTES_LABEL}. Solo se ve desde el pedido, con tu sesión.
      </p>
    </div>
  );
}
