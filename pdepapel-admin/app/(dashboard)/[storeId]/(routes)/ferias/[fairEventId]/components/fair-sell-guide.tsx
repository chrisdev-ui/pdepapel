"use client";

import { ChevronDown, HelpCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/** Clave por feria: la guía se recuerda cerrada o abierta por feria, no en general. */
export const fairGuideStorageKey = (fairEventId: string) =>
  `pdepapel:feria-guia:${fairEventId}`;

interface FairSellGuideProps {
  fairEventId: string;
  /** Hay bucket de comprobantes: la guía menciona la foto del comprobante. */
  paymentProofEnabled: boolean;
}

/**
 * «Cómo vender en la feria», dentro del panel y solo mientras la feria está
 * abierta. Complementa la guía del manual (no la repite): lo justo para
 * cobrar sin salir de la pantalla. Abierta la primera vez que se ve una
 * feria; después queda como la administradora la dejó, para no estorbar en
 * cada recarga.
 */
export function FairSellGuide({
  fairEventId,
  paymentProofEnabled,
}: FairSellGuideProps) {
  // Cerrada en el servidor y en el primer pintado: el estado real vive en el
  // navegador y se lee al montar.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const key = fairGuideStorageKey(fairEventId);
    try {
      const stored = window.localStorage.getItem(key);
      if (stored === "open") {
        setOpen(true);
      } else if (stored === null) {
        // Primera vez con esta feria: se muestra, y desde la siguiente
        // recarga queda recogida salvo que ella la vuelva a abrir.
        setOpen(true);
        window.localStorage.setItem(key, "collapsed");
      }
    } catch {
      // Sin almacenamiento (modo privado) la guía simplemente arranca recogida.
    }
  }, [fairEventId]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(
        fairGuideStorageKey(fairEventId),
        next ? "open" : "collapsed",
      );
    } catch {
      // Igual que arriba.
    }
  };

  return (
    <section
      id="guia-feria"
      aria-labelledby="guia-feria-titulo"
      className="rounded-xl border border-tint-cream bg-tint-cream/30 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-tint-cream">
            <HelpCircle className="h-5 w-5 text-primary" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2
              id="guia-feria-titulo"
              className="text-[15px] font-semibold text-primary"
            >
              Cómo vender en la feria
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              Lo justo para cobrar sin salir de aquí. La guía completa está en
              el manual.
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="guia-feria-contenido"
          className="shrink-0"
        >
          {open ? "Ocultar" : "Ayuda"}
          <ChevronDown
            className={`ml-1 h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </Button>
      </div>

      {open && (
        <ol
          id="guia-feria-contenido"
          className="flex flex-col gap-2 border-t border-tint-cream px-4 py-4 text-sm"
        >
          <li className="flex gap-3">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-primary">
              1
            </span>
            <p>
              <strong>Registra la venta.</strong> Escanea la etiqueta o busca el
              producto en <strong>Producto reservado</strong>, ajusta las
              unidades, elige <strong>Efectivo</strong> o{" "}
              <strong>Transferencia</strong>, pulsa{" "}
              <strong>Registrar pago</strong> y confirma. Entrega cuando veas{" "}
              <strong>«Venta registrada»</strong>.
            </p>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-primary">
              2
            </span>
            <p>
              <strong>Transferencia.</strong> Escribe la referencia del
              comprobante
              {paymentProofEnabled ? (
                <>
                  {" "}
                  y adjunta la foto o captura con{" "}
                  <strong>Adjuntar foto o captura</strong>. Es opcional, pero
                  con ella cotejas el pago en segundos al conciliar y queda
                  guardada en el pedido, protegida.
                </>
              ) : (
                "; queda en el pedido para cotejar el pago después."
              )}
            </p>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-primary">
              3
            </span>
            <p>
              <strong>Kits.</strong> Un kit reservado como kit se vende
              escaneando el kit: una sola línea a su precio. No vendas sus
              piezas por separado.
            </p>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-primary">
              4
            </span>
            <p>
              <strong>¿Qué queda?</strong> La tarjeta{" "}
              <a
                href="#inventario-reservado"
                className="font-semibold underline underline-offset-4"
              >
                Inventario reservado
              </a>
              , aquí abajo, muestra lo disponible de cada producto y se
              actualiza con cada venta.
            </p>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-primary">
              5
            </span>
            <p>
              <strong>Prueba segura y cierre.</strong> Para ensayar, llega hasta{" "}
              <strong>«¿Confirmar pago?»</strong> y pulsa{" "}
              <strong>Revisar</strong>: nada se guarda. Al terminar el día,{" "}
              <strong>Pasar a conciliación</strong> detiene las ventas y abre el
              conteo; el cierre es definitivo. Paso a paso en el{" "}
              <Link
                href="/manual#ferias-guia"
                className="font-semibold underline underline-offset-4"
              >
                manual
              </Link>
              .
            </p>
          </li>
        </ol>
      )}
    </section>
  );
}
