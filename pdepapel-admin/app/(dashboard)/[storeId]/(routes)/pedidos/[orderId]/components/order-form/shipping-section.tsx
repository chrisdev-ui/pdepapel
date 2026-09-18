"use client";

import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { RadioCards } from "@/components/ui/radio-cards";
import { getCarrierInfo } from "@/constants/shipping";
import { PaymentMethod, ShippingProvider, type Box } from "@prisma/client";
import { Store, Truck } from "lucide-react";
import Image from "next/image";
import { useState, type ReactNode } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import type { GetOrderResult } from "../../server/get-order";
import { ConfirmDialog } from "./confirm-dialog";
import type { OrderFormValues, ShippingQuote } from "./schema";
import { SectionCard } from "./section-card";
import { CommonShippingFields } from "./shipping/common-fields";
import { EnvioClickBlock } from "./shipping/envioclick-block";
import { ManualCarrierFields } from "./shipping/manual-carrier-fields";

interface ShippingSectionProps {
  storeId: string;
  boxes: Box[];
  initialData: GetOrderResult["order"];
  loading: boolean;
  loadingQuotes: boolean;
  shippingQuotes: ShippingQuote[];
  /** Momento en que llegaron las tarifas de arriba (para el aviso de vencimiento). */
  quotedAt: Date | null;
  recommendedBox: { name: string; width: number; height: number; length: number } | null;
  /** `silent`: disparo automático; no regaña por datos incompletos. */
  onGetShippingQuotes: (options?: { silent?: boolean }) => Promise<ShippingQuote[] | null>;
  onSelectRate: (quote: ShippingQuote, options?: { silent?: boolean }) => void;
  /** Descarta la tarifa elegida: en el formulario y, si ya estaba guardada, en el servidor. */
  onDiscardRate: () => Promise<void> | void;
  /** Estado real del envío (guía, seguimiento): se muestra debajo de la configuración. */
  children?: ReactNode;
}

/**
 * Envío y empaque: cómo llega el pedido. Recoge en tienda, EnvioClick (cotiza
 * sola, `./shipping/envioclick-block`) u otra transportadora a mano
 * (`./shipping/manual-carrier-fields`); costo, estado y nota son comunes.
 */
export function ShippingSection({
  storeId,
  boxes,
  initialData,
  loading,
  loadingQuotes,
  shippingQuotes,
  quotedAt,
  recommendedBox,
  onGetShippingQuotes,
  onSelectRate,
  onDiscardRate,
  children,
}: ShippingSectionProps) {
  const form = useFormContext<OrderFormValues>();
  const provider = useWatch({ control: form.control, name: "shippingProvider" });
  const carrierName = useWatch({ control: form.control, name: "shipping.carrierName" });
  const hasGuide = Boolean(initialData?.shipping?.envioClickIdOrder);
  const savedRateId = initialData?.shipping?.envioClickIdRate ?? null;
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  // Con «Otra transportadora» manda lo escrito; `courier` es lo que dejó una
  // tarifa de EnvioClick y no debe colarse aquí.
  const carrierInfo = getCarrierInfo(carrierName || "");

  const setCOD = (checked: boolean) => {
    form.setValue("shipping.isCOD", checked, { shouldDirty: true });
    if (checked) form.setValue("payment.method", PaymentMethod.COD, { shouldDirty: true });
    else if (form.getValues("payment.method") === PaymentMethod.COD)
      form.setValue("payment.method", PaymentMethod.BankTransfer, { shouldDirty: true });
  };

  const discard = async () => {
    setDiscarding(true);
    try {
      await onDiscardRate();
    } finally {
      setDiscarding(false);
      setDiscardOpen(false);
    }
  };

  const providerOptions = [
    {
      value: ShippingProvider.NONE,
      title: "Recoge en tienda",
      hint: "Sin transportadora; el cliente pasa por el pedido.",
      icon: <Store className="h-5 w-5 text-primary" aria-hidden="true" />,
    },
    {
      value: ShippingProvider.ENVIOCLICK,
      title: "EnvioClick",
      hint: "Cotiza sola; eliges transportadora y la guía se crea aquí.",
      icon: (
        <Image
          src="https://www.envioclickpro.com.co/img/register/logo_solo.svg"
          alt=""
          width={20}
          height={20}
          className="h-5 w-5 object-contain"
          unoptimized
        />
      ),
    },
    {
      value: ShippingProvider.MANUAL,
      title: "Otra transportadora",
      hint: "Registra guía y costo a mano.",
      icon: <Truck className="h-5 w-5 text-primary" aria-hidden="true" />,
    },
  ];

  return (
    <SectionCard
      id="envio"
      step={3}
      title="Envío y empaque"
      description={
        hasGuide
          ? `Guía de EnvioClick creada (${initialData?.shipping?.envioClickIdOrder}). La configuración ya no cambia.`
          : "Cotiza sola con la ciudad y los productos. La guía se crea desde aquí, una sola vez, cuando el pedido está pagado."
      }
    >
      <FormField
        control={form.control}
        name="shippingProvider"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <RadioCards<ShippingProvider>
                value={field.value}
                onChange={field.onChange}
                options={providerOptions}
                label="Tipo de envío"
                idPrefix="envio"
                disabled={loading || hasGuide}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {provider === ShippingProvider.ENVIOCLICK && (
        <EnvioClickBlock
          storeId={storeId}
          boxes={boxes}
          initialData={initialData}
          loading={loading}
          loadingQuotes={loadingQuotes}
          shippingQuotes={shippingQuotes}
          quotedAt={quotedAt}
          recommendedBox={recommendedBox}
          onGetShippingQuotes={onGetShippingQuotes}
          onSelectRate={onSelectRate}
          onDiscard={() => (savedRateId ? setDiscardOpen(true) : void discard())}
          discarding={discarding}
          setCOD={setCOD}
        />
      )}

      {provider === ShippingProvider.MANUAL && (
        <ManualCarrierFields boxes={boxes} loading={loading} carrierInfo={carrierInfo} setCOD={setCOD} />
      )}

      <CommonShippingFields provider={provider} loading={loading} hasGuide={hasGuide} />
      {children}

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={(open) => !discarding && setDiscardOpen(open)}
        title="Descartar la tarifa guardada"
        from={{ label: carrierName || "Tarifa guardada", tone: "sky" }}
        to={{ label: "Sin tarifa", tone: "slate" }}
        consequences={[
          "Se quita la cotización del pedido y el flete deja de sumarse al total.",
          "Después se cotiza de nuevo con las tarifas del momento.",
          "Solo es posible mientras no exista una guía.",
        ]}
        confirmLabel="Descartar tarifa"
        destructive
        loading={discarding}
        onConfirm={discard}
      />
    </SectionCard>
  );
}
