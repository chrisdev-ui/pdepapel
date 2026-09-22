"use client";

import axios from "axios";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { IGNORE_REASON_MIN_LENGTH } from "@/lib/whatsapp/ignored-contacts";

interface IgnoreContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  conversationId: string;
  contactLabel: string;
  onDone?: () => void;
}

/**
 * Pide el motivo antes de ignorar a alguien.
 *
 * El motivo es obligatorio a propósito: dentro de seis meses, una lista de
 * números sin explicación no se puede revisar, y es justo la que deja a una
 * clienta sin respuesta sin que nadie sepa por qué. El texto también aclara
 * lo que NO pasa, porque es lo que más se malentiende: el WhatsApp de Paula
 * sigue igual.
 */
export function IgnoreContactDialog({
  open,
  onOpenChange,
  storeId,
  conversationId,
  contactLabel,
  onDone,
}: IgnoreContactDialogProps) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const suficiente = reason.trim().length >= IGNORE_REASON_MIN_LENGTH;

  const confirmar = async () => {
    try {
      setLoading(true);
      await axios.post(`/api/${storeId}/conversations/${conversationId}/ignore`, { reason });
      toast({
        title: "Contacto ignorado",
        description: "El panel deja de reflejarlo. Tu WhatsApp sigue igual.",
        variant: "success",
      });
      setReason("");
      onOpenChange(false);
      onDone?.();
    } catch (error) {
      toast({
        title: "No se pudo ignorar",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (loading ? undefined : onOpenChange(next))}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ignorar a {contactLabel}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                El panel deja de reflejar lo que llegue de este contacto y el bot no le
                contesta más.
              </p>
              <p className="rounded-lg bg-tint-cream/60 px-3 py-2 text-primary">
                <strong>Tu WhatsApp no cambia.</strong> Lo sigues viendo y le sigues
                escribiendo desde tu celular como siempre; lo que se detiene es la copia
                de aquí.
              </p>
              <p>Se puede deshacer cuando quieras.</p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="ignore-reason">¿Por qué lo ignoras?</Label>
          <Textarea
            id="ignore-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Por ejemplo: manda decenas de mensajes al día y no es una clienta."
            rows={3}
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground">
            Queda guardado con tu nombre para poder revisarlo después. Mínimo{" "}
            {IGNORE_REASON_MIN_LENGTH} caracteres.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button type="button" onClick={confirmar} disabled={!suficiente} isLoading={loading}>
            Ignorar contacto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
