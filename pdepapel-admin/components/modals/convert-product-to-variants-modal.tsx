"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

interface ConvertProductToVariantsModalProps {
  defaultName: string;
  isOpen: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: (groupName: string) => void;
}

export function ConvertProductToVariantsModal({
  defaultName,
  isOpen,
  loading,
  onClose,
  onConfirm,
}: ConvertProductToVariantsModalProps): JSX.Element {
  const [groupName, setGroupName] = useState(defaultName);

  useEffect(() => {
    if (isOpen) setGroupName(defaultName);
  }, [defaultName, isOpen]);

  const normalizedGroupName = groupName.trim();

  return (
    <Modal
      title="Convertir en variantes"
      description="El producto actual será la primera opción del nuevo grupo."
      isOpen={isOpen}
      onClose={onClose}
    >
      <div className="space-y-5 pt-2">
        <div className="space-y-2">
          <label htmlFor="product-group-name" className="text-sm font-medium">
            Nombre para mostrar del grupo
          </label>
          <Input
            id="product-group-name"
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
            disabled={loading}
            maxLength={180}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Usa un nombre común para todas las opciones, por ejemplo sin el
            color.
          </p>
        </div>
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-950">
          Se conservan el SKU, stock, historial de movimientos, pedidos,
          imágenes y la publicación de Mercado Libre ya vinculada. Después
          podrás crear la otra opción con su propio SKU y stock.
        </div>
        <p className="text-xs text-muted-foreground">
          Esta acción no publica ni modifica nada en Mercado Libre.
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button disabled={loading} variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={loading || !normalizedGroupName}
            onClick={() => onConfirm(normalizedGroupName)}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Crear grupo y continuar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
