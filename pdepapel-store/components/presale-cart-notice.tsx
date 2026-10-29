"use client";

import { Truck } from "lucide-react";

import { describePresaleArrival, isDepositPresaleItem } from "@/lib/presale-deposit";
import { formatArrivalDate } from "@/lib/product-card";
import { cn } from "@/lib/utils";
import { Product } from "@/types";

/**
 * Aviso del carrito cuando hay una preventa.
 *
 * La regla que hay que decir ANTES de pagar: si el carrito trae una preventa,
 * el pedido entero espera, también lo que ya está en bodega. No se parten
 * envíos, así que la única forma de no esperar por lo disponible es hacer dos
 * pedidos, y eso se dice con todas las letras.
 */
export function PresaleCartNotice({
  items,
  className,
}: {
  items: Pick<Product, "id" | "name" | "presales">[];
  className?: string;
}) {
  const presaleItems = items.filter((item) => item.presales?.[0]);
  if (presaleItems.length === 0) return null;

  // La fecha que manda es la más lejana: el pedido sale cuando llegue todo.
  // Una preventa sin fecha (solo texto, o por confirmar) manda sobre cualquier fecha.
  const undated = presaleItems.find((item) => !item.presales![0].expectedArrivalAt);
  const arrival = presaleItems
    .map((item) => item.presales![0].expectedArrivalAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const arrivalLabel = !undated && arrival ? formatArrivalDate(arrival) : null;
  const othersWaiting = items.length - presaleItems.length;
  const deposit = presaleItems.every((item) => isDepositPresaleItem(item));

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-2xl bg-blue-baby/30 p-4 font-sans text-blue-yankees",
        className,
      )}
    >
      <p className="flex items-center gap-2 text-[15px] font-semibold text-blue-800">
        <Truck aria-hidden="true" className="h-4 w-4 shrink-0" />
        {arrivalLabel ? `Todo tu pedido sale el ${arrivalLabel}` : "Todo tu pedido sale cuando llegue la preventa"}
      </p>
      {undated ? (
        <p className="text-sm font-semibold">{describePresaleArrival(undated.presales![0])}</p>
      ) : null}
      {deposit ? (
        <p className="text-sm leading-relaxed">
          Hoy pagas el anticipo. Cuando llegue te escribimos para coordinar el pago del saldo y el envío; ahí lo despachamos.
        </p>
      ) : null}
      <p className="text-sm leading-relaxed">
        {presaleItems.length === 1
          ? `Tienes un producto de preventa (${presaleItems[0].name}).`
          : `Tienes ${presaleItems.length} productos de preventa.`}{" "}
        {othersWaiting > 0 ? (
          <>
            <strong>
              Todo el pedido espera, también{" "}
              {othersWaiting === 1 ? "el producto" : `los ${othersWaiting} productos`} que ya
              {othersWaiting === 1 ? " está" : " están"} disponible
              {othersWaiting === 1 ? "" : "s"}
            </strong>
            : sale completo en un solo envío.
          </>
        ) : (
          "Sale en un solo envío cuando llegue."
        )}
      </p>
      {othersWaiting > 0 ? (
        <p className="text-[13.5px] leading-relaxed text-blue-yankees/80">
          ¿Necesitas lo demás antes? <strong>Haz dos pedidos</strong>: uno con lo
          disponible, que sale el mismo día hábil o el siguiente, y otro con la
          preventa. Es la única forma de no esperar por lo que ya tenemos.
        </p>
      ) : null}
    </div>
  );
}
