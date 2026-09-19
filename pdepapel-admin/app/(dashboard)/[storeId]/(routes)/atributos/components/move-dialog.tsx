"use client";

import axios from "axios";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";

export interface MoveTarget {
  id: string;
  name: string;
}

interface MoveCategoriesDialogProps {
  storeId: string;
  ids: string[];
  types: MoveTarget[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

/** «Mover a otra categoría»: cambia la categoría padre de las subcategorías elegidas; su URL no cambia. */
export function MoveCategoriesDialog({ storeId, ids, types, open, onOpenChange, onDone }: MoveCategoriesDialogProps) {
  const { toast } = useToast();
  const [typeId, setTypeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const count = ids.length;

  const confirm = async () => {
    if (!typeId) return;
    try {
      setSaving(true);
      const response = await axios.post<{ message: string }>(`/api/${storeId}/attributes/move`, { ids, typeId });
      toast({ description: response.data.message, variant: "success" });
      onDone();
    } catch (error) {
      toast({ title: "No se pudo mover", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mover {count === 1 ? "la subcategoría" : `${count} subcategorías`} a otra categoría</DialogTitle>
          <DialogDescription>Cambia la sección del menú de la tienda. La URL de cada subcategoría y sus productos no cambian.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="move-target">Categoría de destino</Label>
          <Combobox id="move-target" value={typeId} onChange={setTypeId} disabled={saving} placeholder="Elige la categoría" searchPlaceholder="Buscar categoría…" options={types.map((type) => ({ value: type.id, label: type.name }))} />
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={!typeId || saving} isLoading={saving} loadingText="Moviendo…" onClick={() => void confirm()}>
            Mover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
