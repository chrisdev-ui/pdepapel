"use client";

import axios from "axios";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { brandsApi } from "@/lib/brand-admin";
import { slugify } from "@/lib/slugify";

interface ChangeSlugDialogProps {
  storeId: string;
  brandId: string;
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: (slug: string) => void;
}

/** «Cambiar dirección»: la anterior queda redirigiendo a la nueva. */
export function ChangeSlugDialog({ storeId, brandId, slug, open, onOpenChange, onChanged }: ChangeSlugDialogProps) {
  const { toast } = useToast();
  const inputId = useId();
  const [draft, setDraft] = useState(slug);
  const [loading, setLoading] = useState(false);
  const next = slugify(draft);

  const onSave = async () => {
    try {
      setLoading(true);
      const { data } = await axios.post<{ slug: string; previousSlug: string | null }>(
        `${brandsApi(storeId)}/${brandId}/slug`,
        { slug: next },
      );
      toast({
        description: data.previousSlug
          ? `Dirección cambiada: /marcas/${data.previousSlug} ahora redirige a /marcas/${data.slug}.`
          : "La dirección no cambió.",
        variant: "success",
      });
      onChanged(data.slug);
      onOpenChange(false);
    } catch (error) {
      toast({ title: "No se pudo cambiar la dirección", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cambiar dirección</DialogTitle>
          <DialogDescription>La dirección anterior redirige a la nueva, así no se pierden enlaces ni posiciones en Google.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <label htmlFor={inputId} className="text-sm font-medium text-primary">
            Nueva dirección
          </label>
          <div className="flex items-center gap-1 text-sm">
            <span className="text-muted-foreground">/marcas/</span>
            <Input id={inputId} value={draft} maxLength={140} onChange={(event) => setDraft(event.target.value)} className="min-h-11" />
          </div>
          <p className="text-xs text-muted-foreground">
            Quedará así: <span className="font-semibold text-primary">/marcas/{next || "…"}</span>
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            className="min-h-11"
            onClick={() => void onSave()}
            disabled={!next || next === slug}
            isLoading={loading}
            loadingText="Cambiando…"
          >
            Cambiar dirección
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
