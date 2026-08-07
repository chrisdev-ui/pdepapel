"use client";

import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { AlertModal } from "@/components/modals/alert-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import type { ReconciliationPreviewRow } from "@/lib/fair-reconciliation-import";

type PreviewResponse = {
  rows: ReconciliationPreviewRow[];
  totalRows: number;
  readyCount: number;
  skippedCount: number;
  errorCount: number;
  importReference: string | null;
  canApply: boolean;
  alreadyApplied: boolean;
};

interface ReconciliationImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

function getRequestError(error: unknown, fallback: string) {
  if (axios.isAxiosError<{ error?: string }>(error)) {
    return error.response?.data?.error ?? fallback;
  }
  return fallback;
}

export const ReconciliationImportModal: React.FC<
  ReconciliationImportModalProps
> = ({ isOpen, onClose, onComplete }) => {
  const params = useParams<{ storeId: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setConfirmOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    if (isReviewing || isApplying) return;
    reset();
    onClose();
  };

  const createFormData = (mode: "preview" | "apply") => {
    if (!file) throw new Error("Selecciona primero una plantilla.");
    const formData = new FormData();
    formData.set("file", file);
    formData.set("mode", mode);
    return formData;
  };

  const reviewFile = async () => {
    if (!file) {
      toast({
        title: "Selecciona la plantilla de conciliación.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsReviewing(true);
      const response = await axios.post<PreviewResponse>(
        `/api/${params.storeId}/inventory/reconciliation-import`,
        createFormData("preview"),
      );
      setPreview(response.data);
      toast({
        title: "Archivo revisado. Comprueba el resumen antes de aplicar.",
      });
    } catch (error) {
      toast({
        title: getRequestError(error, "No pudimos revisar la plantilla."),
        variant: "destructive",
      });
    } finally {
      setIsReviewing(false);
    }
  };

  const applyImport = async () => {
    try {
      setIsApplying(true);
      const response = await axios.post<{ appliedCount: number }>(
        `/api/${params.storeId}/inventory/reconciliation-import`,
        createFormData("apply"),
      );
      toast({
        title: `Se actualizaron ${response.data.appliedCount} productos correctamente.`,
        variant: "success",
      });
      setConfirmOpen(false);
      reset();
      onComplete();
      router.refresh();
    } catch (error) {
      setConfirmOpen(false);
      toast({
        title: getRequestError(
          error,
          "No aplicamos cambios. Revisa y vuelve a descargar una plantilla si el inventario cambió.",
        ),
        variant: "destructive",
      });
    } finally {
      setIsApplying(false);
    }
  };

  const errorRows = preview?.rows.filter((row) => row.status === "error") ?? [];
  const readyRows = preview?.rows.filter((row) => row.status === "ready") ?? [];

  return (
    <>
      <AlertModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={applyImport}
        loading={isApplying}
      />
      <Modal
        title="Conciliar inventario de una feria anterior"
        description="Primero se revisa el archivo. Nada cambia hasta que confirmes la aplicación."
        isOpen={isOpen}
        onClose={handleClose}
        className="max-h-[90vh] max-w-6xl overflow-y-auto"
      >
        <div className="space-y-5">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">Antes de empezar</p>
            <p className="mt-1">
              Esta herramienta solo corrige cantidades de productos. No crea
              ventas ni modifica los pedidos que ya registraste en la feria.
            </p>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">
                1. Descarga una plantilla nueva
              </label>
              <p className="text-xs text-muted-foreground">
                Incluye los productos y el inventario tal como está ahora.
              </p>
            </div>
            <Button asChild variant="outline" type="button">
              <a
                href={`/api/${params.storeId}/inventory/reconciliation-template`}
              >
                <Download className="mr-2 h-4 w-4" />
                Descargar plantilla
              </a>
            </Button>
          </div>

          <div className="space-y-2">
            <label
              className="text-sm font-medium"
              htmlFor="reconciliation-file"
            >
              2. Sube la plantilla ya revisada
            </label>
            <Input
              ref={fileInputRef}
              id="reconciliation-file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={isReviewing || isApplying}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPreview(null);
              }}
            />
            <p className="text-xs text-muted-foreground">
              En Excel llena únicamente las celdas verdes. Solo se consideran
              las filas con
              <span className="font-medium"> Revisado </span> y
              <span className="font-medium"> Autorizar carga = Sí</span>.
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={reviewFile}
              disabled={!file || isReviewing || isApplying}
            >
              {isReviewing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="mr-2 h-4 w-4" />
              )}
              Revisar archivo
            </Button>
          </div>

          {preview && (
            <div className="space-y-4 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="success">
                  {preview.readyCount} para aplicar
                </Badge>
                <Badge variant="secondary">
                  {preview.skippedCount} sin cambio o sin autorizar
                </Badge>
                <Badge
                  variant={preview.errorCount > 0 ? "destructive" : "outline"}
                >
                  {preview.errorCount} con errores
                </Badge>
              </div>

              {preview.alreadyApplied && (
                <p className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive">
                  Esta misma plantilla ya fue aplicada. Descarga una nueva antes
                  de continuar.
                </p>
              )}

              {errorRows.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-destructive">
                    Corrige estos problemas antes de aplicar cualquier cambio:
                  </p>
                  <ScrollArea className="h-48 rounded-md border">
                    <div className="space-y-3 p-3">
                      {errorRows.map((row) => (
                        <div
                          key={`${row.rowNumber}-${row.sku}`}
                          className="text-sm"
                        >
                          <p className="font-medium">
                            Fila {row.rowNumber}:{" "}
                            {row.productName ||
                              row.sku ||
                              "Producto sin identificar"}
                          </p>
                          <ul className="list-disc pl-5 text-muted-foreground">
                            {row.errors.map((error) => (
                              <li key={error}>{error}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {readyRows.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">
                    Cambios que se aplicarán
                  </p>
                  <ScrollArea className="h-48 rounded-md border">
                    <div className="min-w-[640px] divide-y text-sm">
                      {readyRows.map((row) => (
                        <div
                          key={`${row.rowNumber}-${row.sku}`}
                          className="grid grid-cols-[1fr_auto_auto] gap-4 p-3"
                        >
                          <span>{row.productName || row.sku}</span>
                          <span className="text-muted-foreground">
                            {row.expectedStock} → {row.physicalCount}
                          </span>
                          <span
                            className={
                              row.difference && row.difference > 0
                                ? "font-semibold text-green-700"
                                : "font-semibold text-destructive"
                            }
                          >
                            {row.difference && row.difference > 0 ? "+" : ""}
                            {row.difference}
                          </span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={isApplying}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={!preview.canApply || isApplying}
                >
                  {isApplying ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Aplicar {preview.readyCount} ajustes
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};
