import { Info } from "lucide-react";

import { CUSTOMERS_ORDER_TAKE } from "../server/get-customers";

/**
 * Aquí no hay una tabla de clientes: cada persona se arma juntando los pedidos
 * que comparten teléfono. Decirlo en pantalla evita leer de más una lista que
 * no siempre es «una fila, una persona».
 */
export function GroupingNote() {
  return (
    <div className="flex items-start gap-2 rounded-xl border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <p>
        Cada cliente se arma agrupando los pedidos que comparten el mismo
        teléfono. Dos personas que piden con el mismo número aparecen como un
        solo cliente, y una persona que pidió con dos números aparece dos veces.
      </p>
    </div>
  );
}

/**
 * El tope de pedidos no cambia nada hasta que se alcanza; cuando se alcance,
 * «gastado» y «compras» dejan de ser de siempre y hay que decirlo.
 */
export function TruncationNote() {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-yellow-500/50 bg-yellow-50 p-3 text-xs leading-relaxed text-yellow-800">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <p>
        Se están agrupando los {CUSTOMERS_ORDER_TAKE.toLocaleString("es-CO")}{" "}
        pedidos más recientes. Hay pedidos más antiguos que no entran en estas
        cifras, así que «gastado» y «compras» se quedan cortos para quien lleve
        mucho tiempo comprando.
      </p>
    </div>
  );
}
