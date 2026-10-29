"use client";

import axios from "axios";
import { CalendarClock, ExternalLink, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { formatAvailableAt } from "@/lib/product-availability";
import { describePresaleArrival, describePresaleDeposit } from "@/lib/presale-copy";
import { currencyFormatter } from "@/lib/utils";

export interface ProductPresaleSummary {
  id: string;
  expectedArrivalAt: string | null;
  expectedArrivalText: string | null;
  unitLimit: number | null;
  committedUnits: number;
  paymentMode: "FULL" | "DEPOSIT";
  depositType: "FIXED" | "PERCENT" | null;
  depositValue: number | null;
  termsText: string | null;
  balanceDueDays: number | null;
}

interface PresaleDraft {
  arrival: string;
  arrivalText: string;
  limit: string;
  unlimited: boolean;
  deposit: boolean;
  depositType: "FIXED" | "PERCENT";
  depositValue: string;
  termsText: string;
  balanceDueDays: string;
}

const EMPTY_DRAFT: PresaleDraft = {
  arrival: "",
  arrivalText: "",
  limit: "",
  unlimited: false,
  deposit: false,
  depositType: "FIXED",
  depositValue: "",
  termsText: "",
  balanceDueDays: "",
};

function draftFrom(presale: ProductPresaleSummary): PresaleDraft {
  return {
    arrival: presale.expectedArrivalAt ? presale.expectedArrivalAt.slice(0, 10) : "",
    arrivalText: presale.expectedArrivalText ?? "",
    limit: presale.unitLimit === null ? "" : String(presale.unitLimit),
    unlimited: presale.unitLimit === null,
    deposit: presale.paymentMode === "DEPOSIT",
    depositType: presale.depositType ?? "FIXED",
    depositValue: presale.depositValue === null ? "" : String(presale.depositValue),
    termsText: presale.termsText ?? "",
    balanceDueDays: presale.balanceDueDays === null ? "" : String(presale.balanceDueDays),
  };
}

function payloadFrom(draft: PresaleDraft) {
  return {
    expectedArrivalAt: draft.arrival || null,
    expectedArrivalText: draft.arrivalText.trim() || null,
    unitLimit: draft.unlimited || !draft.limit ? null : Number(draft.limit),
    paymentMode: draft.deposit ? "DEPOSIT" : "FULL",
    depositType: draft.deposit ? draft.depositType : null,
    depositValue: draft.deposit && draft.depositValue ? Number(draft.depositValue) : null,
    termsText: draft.termsText.trim() || null,
    balanceDueDays: draft.deposit && draft.balanceDueDays ? Number(draft.balanceDueDays) : null,
  };
}

function draftIsComplete(draft: PresaleDraft) {
  if (!draft.unlimited && !draft.limit) return false;
  if (draft.deposit && !draft.depositValue) return false;
  return true;
}

function PresaleFields({
  draft,
  onChange,
  disabled,
}: {
  draft: PresaleDraft;
  onChange: (next: PresaleDraft) => void;
  disabled: boolean;
}) {
  const set = <K extends keyof PresaleDraft>(key: K, value: PresaleDraft[K]) => onChange({ ...draft, [key]: value });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="presale-arrival">Cuándo llega</Label>
          <DateField
            id="presale-arrival"
            value={draft.arrival}
            onChange={(value) => set("arrival", value)}
            clearable
            placeholder="Por confirmar"
            aria-label="Fecha en que llega la mercancía"
            disabled={disabled}
          />
          <Input
            id="presale-arrival-text"
            aria-label="Fecha aproximada en texto"
            value={draft.arrivalText}
            maxLength={120}
            onChange={(event) => set("arrivalText", event.target.value)}
            placeholder="O en texto: primera semana de diciembre"
            disabled={disabled}
          />
          <p className="text-[0.8rem] text-muted-foreground">
            Sin fecha ni texto, la tienda dice «Fecha estimada: por confirmar». Puedes ponerla después.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="presale-limit">Cuántas puedes prometer</Label>
          <Input
            id="presale-limit"
            type="number"
            min={1}
            value={draft.unlimited ? "" : draft.limit}
            onChange={(event) => set("limit", event.target.value)}
            placeholder={draft.unlimited ? "Sin tope" : "40"}
            disabled={disabled || draft.unlimited}
          />
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <Checkbox
              checked={draft.unlimited}
              onCheckedChange={(checked) => set("unlimited", checked === true)}
              disabled={disabled}
              aria-label="Sin tope de unidades"
            />
            Sin tope (máximo 5 por pedido)
          </label>
        </div>
      </div>

      <fieldset className="space-y-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-semibold">Cómo se paga</legend>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <Checkbox
            checked={draft.deposit}
            onCheckedChange={(checked) => set("deposit", checked === true)}
            disabled={disabled}
            aria-label="Con anticipo"
          />
          Con anticipo: hoy paga una parte y el saldo con el envío cuando llegue
        </label>
        {draft.deposit && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="presale-deposit-type">Tipo de anticipo</Label>
              <select
                id="presale-deposit-type"
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={draft.depositType}
                onChange={(event) => set("depositType", event.target.value as PresaleDraft["depositType"])}
                disabled={disabled}
              >
                <option value="FIXED">Valor fijo por unidad</option>
                <option value="PERCENT">Porcentaje del precio</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="presale-deposit-value">{draft.depositType === "FIXED" ? "Anticipo por unidad (pesos)" : "Porcentaje (1 a 99)"}</Label>
              <Input
                id="presale-deposit-value"
                type="number"
                min={1}
                max={draft.depositType === "PERCENT" ? 99 : undefined}
                value={draft.depositValue}
                onChange={(event) => set("depositValue", event.target.value)}
                placeholder={draft.depositType === "FIXED" ? "30000" : "20"}
                disabled={disabled}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="presale-balance-days">Días para pagar el saldo</Label>
              <Input
                id="presale-balance-days"
                type="number"
                min={1}
                max={60}
                value={draft.balanceDueDays}
                onChange={(event) => set("balanceDueDays", event.target.value)}
                placeholder="5"
                disabled={disabled}
              />
            </div>
          </div>
        )}
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="presale-terms">Condiciones de esta preventa (opcional)</Label>
        <Textarea
          id="presale-terms"
          value={draft.termsText}
          maxLength={2000}
          rows={3}
          onChange={(event) => set("termsText", event.target.value)}
          placeholder="Ej.: unidades limitadas por proveedor; colores según disponibilidad."
          disabled={disabled}
        />
        <p className="text-[0.8rem] text-muted-foreground">
          Se muestran en la ficha y al pagar, debajo de las reglas fijas de preventa. Texto plano.
        </p>
      </div>
    </div>
  );
}

/**
 * La preventa desde la ficha del producto: abrirla y editarla mientras esté
 * activa. Liberar, avisar un retraso y cancelar viven en Preventas, que es
 * donde se ven los pedidos.
 */
export function PresaleSection({
  storeId,
  productId,
  presale,
  isKit,
  isArchived = false,
  children,
}: {
  storeId: string;
  productId: string | null;
  presale: ProductPresaleSummary | null;
  isKit: boolean;
  isArchived?: boolean;
  /** La lista de espera, debajo del resumen. */
  children?: ReactNode;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PresaleDraft>(EMPTY_DRAFT);

  const save = async () => {
    if (!productId) return;
    try {
      setLoading(true);
      if (presale) {
        await axios.patch(`/api/${storeId}/presales/${presale.id}`, payloadFrom(draft));
      } else {
        await axios.post(`/api/${storeId}/presales`, { productId, ...payloadFrom(draft) });
      }
      setEditing(false);
      setDraft(EMPTY_DRAFT);
      router.refresh();
      toast({
        title: presale ? "Preventa actualizada" : "Preventa abierta",
        description: presale
          ? "Los cambios aplican a los pedidos nuevos; los que ya pagaron conservan lo que aceptaron."
          : isArchived
            ? "Queda lista. La tienda la muestra cuando desarchives el producto."
            : "El producto ya se puede reservar en la tienda.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: presale ? "No se pudo guardar la preventa" : "No se pudo abrir la preventa",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const description = "Vender hoy algo que llega después.";

  if (isKit) {
    return (
      <SectionCard id="preventa" title="Preventa" description={description}>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Un kit no se puede vender en preventa: su stock sale de los
          componentes, así que al liberar no habría de dónde descontar. Abre la
          preventa de cada componente por separado.
        </p>
      </SectionCard>
    );
  }

  if (!productId) {
    return (
      <SectionCard id="preventa" title="Preventa" description={description}>
        <p className="text-sm text-muted-foreground">
          Guarda el producto primero y después podrás abrirle una preventa.
        </p>
      </SectionCard>
    );
  }

  const archivedNote = isArchived ? (
    <p className="rounded-md bg-tint-cream p-2 text-xs text-primary">
      El producto está archivado: la preventa queda lista, pero la tienda no la muestra hasta que lo desarchives.
    </p>
  ) : null;

  if (presale && !editing) {
    const remaining = presale.unitLimit === null ? null : Math.max(0, presale.unitLimit - presale.committedUnits);
    return (
      <SectionCard id="preventa" title="Preventa" description={description} action={<Badge>En preventa</Badge>}>
        <div className="space-y-3">
          {archivedNote}
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {presale.expectedArrivalAt
                ? <>Llega el <strong>{formatAvailableAt(presale.expectedArrivalAt)}</strong></>
                : <strong>{describePresaleArrival(presale)}</strong>}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong>{presale.committedUnits}</strong>
              {presale.unitLimit === null
                ? presale.committedUnits === 1 ? " reservada, sin tope" : " reservadas, sin tope"
                : ` de ${presale.unitLimit} reservadas`}
              {remaining === null ? "" : remaining === 0 ? " · sin cupo" : ` · quedan ${remaining}`}
            </span>
          </p>
          <p className="text-sm">{describePresaleDeposit(presale, currencyFormatter)}</p>
          <p className="text-xs text-muted-foreground">
            Mientras esté en preventa, este producto queda fuera de Mercado
            Libre y su inventario no se toca. Inventario, «Por reponer» y el
            kardex siguen mostrando solo el stock real.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={() => {
                setDraft(draftFrom(presale));
                setEditing(true);
              }}
            >
              Editar preventa
            </Button>
            <Button variant="outline" size="sm" className="min-h-11" asChild>
              <Link href={`/${storeId}/preventas`}>
                Ver en Preventas
                <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
          {children}
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard id="preventa" title="Preventa" description={description}>
      {archivedNote}
      <PresaleFields draft={draft} onChange={setDraft} disabled={loading} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" className="min-h-11 w-fit" disabled={loading || !draftIsComplete(draft)} onClick={save}>
          {presale ? "Guardar preventa" : "Abrir preventa"}
        </Button>
        {presale && (
          <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={loading} onClick={() => setEditing(false)}>
            Cancelar edición
          </Button>
        )}
      </div>
      {!presale && (
        <p className="text-xs text-muted-foreground">
          Al abrirla, el producto sale de Mercado Libre hasta que la liberes, y su
          stock no se toca: el inventario se descuenta el día que llegue la
          mercancía y la liberes desde Preventas.
        </p>
      )}
    </SectionCard>
  );
}
