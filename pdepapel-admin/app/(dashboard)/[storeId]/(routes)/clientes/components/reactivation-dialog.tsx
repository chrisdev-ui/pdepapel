"use client";

import { Check, MessageCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
import { buildReactivationMessage, buildWhatsAppLink } from "@/lib/customer-views";

import { formatPhone } from "./columns";

export interface ReactivationTarget {
  id: string;
  fullName: string;
  phone: string;
}

interface ReactivationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: ReactivationTarget[];
  storeName: string;
  storeUrl: string;
}

const NAME_TOKEN = "{nombre}";

/**
 * Reactivación en lote por WhatsApp: un mensaje editable con {nombre} y un
 * botón por cliente. Cada botón abre WhatsApp con el texto listo; no hay
 * envío automático ni registro en la base de datos.
 */
export function ReactivationDialog({ open, onOpenChange, customers, storeName, storeUrl }: ReactivationDialogProps) {
  const defaultMessage = useMemo(
    () => buildReactivationMessage({ firstName: NAME_TOKEN, storeName, storeUrl }),
    [storeName, storeUrl],
  );
  const [message, setMessage] = useState(defaultMessage);
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setMessage(defaultMessage);
      setDone(new Set());
    }
  }, [open, defaultMessage]);

  const personalize = (customer: ReactivationTarget) =>
    message.replaceAll(NAME_TOKEN, customer.fullName.trim().split(/\s+/)[0] ?? "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Reactivar por WhatsApp</DialogTitle>
          <DialogDescription>
            Escribe un mensaje; «{NAME_TOKEN}» se cambia por el nombre de cada persona. Cada botón abre WhatsApp con el texto listo para enviar.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="reactivation-message">Mensaje</Label>
          <Textarea
            id="reactivation-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={5}
          />
        </div>
        <ul className="divide-y rounded-lg border">
          {customers.map((customer) => {
            const sent = done.has(customer.id);
            return (
              <li key={customer.id} className="flex items-center gap-3 px-3 py-2">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{customer.fullName}</span>
                  <span className="text-xs text-muted-foreground">{formatPhone(customer.phone)}</span>
                </span>
                <Button
                  asChild
                  type="button"
                  size="sm"
                  variant={sent ? "outline" : "soft"}
                  onClick={() => setDone((current) => new Set(current).add(customer.id))}
                >
                  <a href={buildWhatsAppLink(customer.phone, personalize(customer))} target="_blank" rel="noopener noreferrer">
                    {sent ? <Check className="mr-1.5 h-4 w-4" aria-hidden="true" /> : <MessageCircle className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                    {sent ? "Abierto" : "Abrir WhatsApp"}
                  </a>
                </Button>
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          <span className="mr-auto text-xs text-muted-foreground">
            {done.size} de {customers.length} abiertos
          </span>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
