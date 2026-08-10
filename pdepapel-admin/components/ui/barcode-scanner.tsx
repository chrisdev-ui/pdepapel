"use client";

import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import { Camera, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type BarcodeScannerProps = {
  onDetected: (code: string) => void;
  description?: string;
  label?: string;
};

export function BarcodeScanner({
  onDetected,
  description = "Apunta la cámara al código de barras o QR del producto.",
  label = "Escanear",
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [open, setOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !videoRef.current) return;

    const reader = new BrowserMultiFormatReader();
    let isActive = true;
    setIsStarting(true);
    setError(null);

    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        videoRef.current,
        (result) => {
          if (!isActive || !result) return;

          controlsRef.current?.stop();
          onDetected(result.getText().trim());
          setOpen(false);
        },
      )
      .then((controls) => {
        controlsRef.current = controls;
        if (isActive) setIsStarting(false);
        else controls.stop();
      })
      .catch(() => {
        if (!isActive) return;
        setError(
          "No fue posible iniciar la cámara. Revisa el permiso o usa el campo de código.",
        );
        setIsStarting(false);
      });

    return () => {
      isActive = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [onDetected, open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) controlsRef.current?.stop();
        setOpen(nextOpen);
      }}
    >
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Camera className="mr-2 h-4 w-4" />
        {label}
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Escanear código</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="overflow-hidden rounded-lg bg-muted">
          <video
            ref={videoRef}
            className="aspect-square w-full object-cover"
            muted
            playsInline
          />
        </div>
        {isStarting && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Iniciando cámara…
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
