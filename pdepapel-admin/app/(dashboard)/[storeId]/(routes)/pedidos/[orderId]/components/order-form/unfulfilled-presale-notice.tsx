import { AlertTriangle } from "lucide-react";

/**
 * «Sin unidad»: la preventa se liberó a medias y a este pedido no le alcanzó.
 * No sale nunca solo; se cancela con la devolución. Los términos dicen «si el
 * producto no llega, te devolvemos todo»: aquí no se retiene nada.
 */
export function UnfulfilledPresaleNotice() {
  return (
    <section
      aria-labelledby="sin-unidad-titulo"
      className="mt-2 flex gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
      data-testid="unfulfilled-presale-notice"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <div className="flex flex-col gap-1.5">
        <h3 id="sin-unidad-titulo" className="font-semibold text-destructive">
          Preventa sin unidad: hay que devolver
        </h3>
        <p>Llegó menos de lo vendido y a este pedido no le alcanzó. No se despacha.</p>
        <ol className="list-decimal space-y-0.5 pl-5">
          <li>Escríbele a la clienta: no llegó su unidad y le devuelves todo (o, si lo prefiere, queda como saldo a favor).</li>
          <li>Haz la devolución en Bold o por transferencia. No se retiene nada: el producto no llegó.</li>
          <li>Cancela este pedido y anota lo devuelto (valor, fecha y medio) o el saldo a favor.</li>
        </ol>
      </div>
    </section>
  );
}
