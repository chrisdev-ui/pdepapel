"use client";

import axios from "axios";
import { Mail, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";
import { TintBadge } from "@/components/ui/tint-badge";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import type { PanelInvitation } from "@/lib/invitations";

interface InvitationsClientProps {
  storeId: string;
  stores: { id: string; name: string }[];
  invitations: PanelInvitation[];
}

const DATE = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" });

/**
 * Invitar a alguien de solo lectura: correo, tiendas que verá y envío. La
 * invitación la guarda Clerk, no hay tabla propia; al aceptarla, la persona
 * llega con el permiso puesto.
 */
export function InvitationsClient({ storeId, stores, invitations }: InvitationsClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<string[]>([storeId]);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [revoking, setRevoking] = useState<PanelInvitation | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleStore = (id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  };

  const send = async () => {
    try {
      setSending(true);
      setConfirming(false);
      await axios.post(`/api/${storeId}/invitations`, { emailAddress: email.trim(), allowedStoreIds: selected });
      toast({ title: "Invitación enviada", description: `${email.trim()} recibirá el enlace por correo.`, variant: "success" });
      setEmail("");
      setSelected([storeId]);
      router.refresh();
    } catch (error) {
      toast({ title: "No se pudo invitar", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const revoke = async () => {
    if (!revoking) return;
    try {
      setBusy(true);
      await axios.delete(`/api/${storeId}/invitations/${revoking.id}`);
      toast({ description: `La invitación de ${revoking.emailAddress} quedó anulada.`, variant: "success" });
      setRevoking(null);
      router.refresh();
    } catch (error) {
      toast({ title: "No se pudo anular", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const canSend = email.trim().length > 3 && selected.length > 0 && !sending;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-6">
      <SectionCard
        id="invitar"
        title="Invitar a ver el panel"
        description="La persona recibe un correo, crea su cuenta desde ese enlace y entra con permiso de solo lectura: puede mirar, nunca cambiar nada."
        action={<TintBadge tone="mint" label="Solo lectura" />}
      >
        <div className="grid gap-2">
          <Label htmlFor="invitation-email">Correo</Label>
          <Input
            id="invitation-email"
            type="email"
            autoComplete="off"
            placeholder="persona@agencia.com"
            value={email}
            disabled={sending}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold text-primary">Qué tiendas podrá ver</legend>
          {stores.map((store) => (
            <label key={store.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selected.includes(store.id)}
                onCheckedChange={() => toggleStore(store.id)}
                disabled={sending}
                aria-label={store.name}
              />
              {store.name}
            </label>
          ))}
        </fieldset>
        <Button type="button" disabled={!canSend} isLoading={sending} onClick={() => setConfirming(true)}>
          {!sending && <Mail className="mr-2 h-4 w-4" aria-hidden="true" />}
          Enviar invitación
        </Button>
        <p className="text-xs text-muted-foreground">
          El permiso viaja en la invitación: no hay que tocar nada en Clerk después. Caduca a los 30 días si nadie la acepta.
        </p>
      </SectionCard>

      <SectionCard id="pendientes" title="Invitaciones pendientes" description="Quien todavía no ha aceptado. Anular una deja el enlace sin efecto.">
        {invitations.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No hay invitaciones pendientes.
          </p>
        ) : (
          <ul className="space-y-2" aria-label="Invitaciones pendientes">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border p-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="break-all text-sm font-semibold">{invitation.emailAddress}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    {invitation.malformed ? (
                      <TintBadge tone="pink" label="Permiso sin forma válida" className="text-[11px]" />
                    ) : (
                      <>
                        Solo lectura · {invitation.storeNames.join(", ")}
                      </>
                    )}
                  </span>
                  <span className="text-[11px] text-muted-foreground">Enviada el {DATE.format(new Date(invitation.createdAt))}</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setRevoking(invitation)}
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Anular
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Invitar a {email.trim()}?</AlertDialogTitle>
            <AlertDialogDescription>
              Recibirá un correo para crear su cuenta y entrará con permiso de solo lectura en{" "}
              {stores.filter((store) => selected.includes(store.id)).map((store) => store.name).join(", ")}. No podrá
              crear, editar ni borrar nada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={sending}
              onClick={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              Sí, enviar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={revoking !== null} onOpenChange={(open) => !open && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Anular la invitación de {revoking?.emailAddress}?</AlertDialogTitle>
            <AlertDialogDescription>
              El enlace deja de funcionar. Si ya creó su cuenta con él, esto no se la quita: eso se hace desde Clerk.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Volver</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void revoke();
              }}
            >
              Sí, anular
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
