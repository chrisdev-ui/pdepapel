"use client";

import axios from "axios";
import { useParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";

interface EmailListsPanelProps {
  excludedCustomerEmails: string[];
  adminNotificationEmails: string[];
  mercadoLibreAlertEmails: string[];
  /** Solo para decir en la ayuda que ese correo ya cuenta; nunca se edita aquí. */
  hasStoreEmail: boolean;
}

/**
 * Listas que antes vivían escritas en el código. Se guardan aparte de los
 * datos del negocio: ese formulario reescribe sus campos completos.
 */
export function EmailListsPanel({
  excludedCustomerEmails,
  adminNotificationEmails,
  mercadoLibreAlertEmails,
  hasStoreEmail,
}: EmailListsPanelProps) {
  const params = useParams<{ storeId: string }>();
  const [excluded, setExcluded] = useState(excludedCustomerEmails.join("\n"));
  const [recipients, setRecipients] = useState(adminNotificationEmails.join("\n"));
  const [mercadoLibre, setMercadoLibre] = useState(mercadoLibreAlertEmails.join("\n"));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    try {
      setSaving(true);
      const { data } = await axios.patch(`/api/${params.storeId}/settings/emails`, {
        excludedCustomerEmails: excluded,
        adminNotificationEmails: recipients,
        mercadoLibreAlertEmails: mercadoLibre,
      });
      setExcluded((data.excludedCustomerEmails as string[]).join("\n"));
      setRecipients((data.adminNotificationEmails as string[]).join("\n"));
      setMercadoLibre((data.mercadoLibreAlertEmails as string[]).join("\n"));
      toast({ description: "Correos guardados", variant: "success" });
    } catch (error) {
      const message = axios.isAxiosError(error) ? (error.response?.data?.error ?? "No se pudo guardar") : "No se pudo guardar";
      toast({ description: message, variant: "warning" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <Heading
        title="Correos del equipo y de avisos"
        description="Una dirección por línea. Solo la dueña ve y edita estas listas; nunca se publican en la tienda."
      />
      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="excluded-customer-emails">Correos del equipo (no son clientas)</Label>
          <Textarea
            id="excluded-customer-emails"
            value={excluded}
            onChange={(event) => setExcluded(event.target.value)}
            rows={4}
            disabled={saving}
            placeholder="nombre@ejemplo.com"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-sm text-muted-foreground">
            Los pedidos hechos con estos correos no cuentan en Clientes, en los segmentos ni en los correos de
            reactivación. {hasStoreEmail ? "El correo de la tienda y el de «clientes varios» ya se excluyen solos." : "El correo de «clientes varios» ya se excluye solo."}
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="admin-notification-emails">Correos que reciben los avisos del panel</Label>
          <Textarea
            id="admin-notification-emails"
            value={recipients}
            onChange={(event) => setRecipients(event.target.value)}
            rows={4}
            disabled={saving}
            placeholder="nombre@ejemplo.com"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-sm text-muted-foreground">
            Pedidos nuevos, pagos raros, ventas de Mercado Libre, alertas de la base de datos y el formulario de contacto
            de la tienda. {hasStoreEmail ? "Vacía, los avisos van al correo de la tienda." : "Vacía y sin correo de la tienda, no sale ningún aviso."}
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="mercadolibre-alert-emails">Alertas de Mercado Libre</Label>
          <Textarea
            id="mercadolibre-alert-emails"
            value={mercadoLibre}
            onChange={(event) => setMercadoLibre(event.target.value)}
            rows={4}
            disabled={saving}
            placeholder="nombre@ejemplo.com"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-sm text-muted-foreground">
            Solo para las alertas de Mercado Libre (salud de publicaciones, reconexión). Vacía: no se envían por correo;
            siguen en el panel.
          </p>
        </div>
      </div>
      <Button type="button" onClick={save} disabled={saving} className="self-start">
        {saving ? "Guardando…" : "Guardar correos"}
      </Button>
    </section>
  );
}
