"use client";

import axios from "axios";
import { CalendarClock, ExternalLink, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { formatAvailableAt } from "@/lib/product-availability";

export interface ProductPresaleSummary {
  id: string;
  expectedArrivalAt: string;
  unitLimit: number;
  committedUnits: number;
}

/**
 * Abrir una preventa desde la ficha del producto.
 *
 * Solo crea. Liberar y avisar de un retraso viven en la pantalla de
 * Preventas, que es donde se ve el panorama completo.
 */
export function PresaleSection({
  storeId,
  productId,
  presale,
  isKit,
}: {
  storeId: string;
  productId: string | null;
  presale: ProductPresaleSummary | null;
  isKit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [arrival, setArrival] = useState("");
  const [limit, setLimit] = useState("");

  const create = async () => {
    if (!productId) return;
    try {
      setLoading(true);
      await axios.post(`/api/${storeId}/presales`, {
        productId,
        expectedArrivalAt: arrival,
        unitLimit: Number(limit),
      });
      setArrival("");
      setLimit("");
      router.refresh();
      toast({
        title: "Preventa abierta",
        description: "El producto ya se puede reservar en la tienda.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "No se pudo abrir la preventa",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (isKit) {
    return (
      <SectionCard
        id="preventa"
        title="Preventa"
        description="Cobrar hoy por algo que llega después."
      >
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
      <SectionCard
        id="preventa"
        title="Preventa"
        description="Cobrar hoy por algo que llega después."
      >
        <p className="text-sm text-muted-foreground">
          Guarda el producto primero y después podrás abrirle una preventa.
        </p>
      </SectionCard>
    );
  }

  if (presale) {
    const remaining = Math.max(0, presale.unitLimit - presale.committedUnits);
    return (
      <SectionCard
        id="preventa"
        title="Preventa"
        description="Cobrar hoy por algo que llega después."
        action={<Badge>En preventa</Badge>}
      >
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm">
            <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
            Llega el <strong>{formatAvailableAt(presale.expectedArrivalAt)}</strong> ·{" "}
            <strong>{presale.committedUnits}</strong> de {presale.unitLimit} reservadas
            {remaining === 0 ? " · sin cupo" : ` · quedan ${remaining}`}
          </p>
          <p className="text-xs text-muted-foreground">
            Mientras esté en preventa, este producto queda fuera de Mercado
            Libre y su inventario no se toca. Inventario, «Por reponer» y el
            kardex siguen mostrando solo el stock real.
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/${storeId}/preventas`}>
              Ver en Preventas
              <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      id="preventa"
      title="Preventa"
      description="Cobrar hoy por algo que llega después. La clienta paga el total y el pedido espera."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="presale-arrival">Cuándo llega</Label>
          <DateField
            value={arrival}
            onChange={setArrival}
            clearable
            placeholder="Elige la fecha"
            aria-label="Fecha en que llega la mercancía"
          />
          <p className="text-[0.8rem] text-muted-foreground">
            Es la fecha que se le promete a la clienta y la que manda para saber
            si la preventa se venció.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="presale-limit">Cuántas puedes prometer</Label>
          <Input
            id="presale-limit"
            type="number"
            min={1}
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
            placeholder="40"
            disabled={loading}
          />
          <p className="text-[0.8rem] text-muted-foreground">
            El tope que le pediste a tu proveedora. Cuando se llene, la tienda
            deja de aceptar reservas sola.
          </p>
        </div>
      </div>

      <Button
        type="button"
        size="sm"
        className="w-fit"
        disabled={loading || !arrival || !limit}
        onClick={create}
      >
        Abrir preventa
      </Button>

      <p className="text-xs text-muted-foreground">
        Al abrirla, el producto sale de Mercado Libre hasta que la liberes, y su
        stock no se toca: el inventario se descuenta el día que llegue la
        mercancía y la liberes desde Preventas.
      </p>
    </SectionCard>
  );
}
