"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { DateField } from "@/components/ui/date-field";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import type { ShippingCarrier } from "@/constants/shipping";
import { toDateInputValue } from "@/lib/date-input";
import type { Box } from "@prisma/client";
import { parseISO } from "date-fns";
import Image from "next/image";
import { useFormContext, useWatch } from "react-hook-form";

import type { OrderFormValues } from "../schema";
import { BoxSelect } from "./box-select";

interface ManualCarrierFieldsProps {
  boxes: Box[];
  loading: boolean;
  carrierInfo?: ShippingCarrier;
  setCOD: (checked: boolean) => void;
}

/** «Otra transportadora»: guía, enlaces, plazos y caja registrados a mano. */
export function ManualCarrierFields({
  boxes,
  loading,
  carrierInfo,
  setCOD,
}: ManualCarrierFieldsProps) {
  const form = useFormContext<OrderFormValues>();
  const boxId = useWatch({ control: form.control, name: "shipping.boxId" });
  return (
    <div className="flex flex-col gap-4 rounded-lg bg-muted/50 p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="shipping.carrierName"
          render={({ field }) => (
            <FormItem>
              <FormLabel isRequired>Transportadora</FormLabel>
              <FormControl>
                <Input
                  placeholder="Ej: Servientrega, TCC, Coordinadora"
                  disabled={loading}
                  {...field}
                  value={field.value || ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <BoxSelect
          id="caja-manual"
          boxes={boxes}
          value={boxId}
          disabled={loading}
          onChange={(value) =>
            form.setValue(
              "shipping.boxId",
              value === "auto" ? undefined : value,
              { shouldDirty: true },
            )
          }
        />
        <FormField
          control={form.control}
          name="shipping.trackingCode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Número de guía</FormLabel>
              <FormControl>
                <Input
                  placeholder="Ej: SER123456789"
                  disabled={loading}
                  {...field}
                  value={field.value || ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="shipping.trackingUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Enlace de seguimiento</FormLabel>
              <FormControl>
                <Input
                  placeholder="https://…"
                  inputMode="url"
                  disabled={loading}
                  {...field}
                  value={field.value || ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="shipping.guideUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Enlace de la guía (PDF)</FormLabel>
              <FormControl>
                <Input
                  placeholder="https://…"
                  inputMode="url"
                  disabled={loading}
                  {...field}
                  value={field.value || ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="shipping.deliveryDays"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Días de entrega</FormLabel>
              <FormControl>
                <div className="flex">
                  <StockQuantityInput
                    min={0}
                    max={60}
                    disabled={loading}
                    value={Number(field.value || 0)}
                    onChange={field.onChange}
                    ariaLabel="Días de entrega"
                    className="sm:max-w-[180px]"
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="shipping.estimatedDeliveryDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Entrega estimada</FormLabel>
              <FormControl>
                <DateField
                  id="envio-entrega-estimada"
                  value={toDateInputValue(field.value)}
                  onChange={(iso) =>
                    field.onChange(iso ? parseISO(iso) : undefined)
                  }
                  disabled={loading}
                  placeholder="Elige una fecha"
                  clearable
                  aria-label="Entrega estimada"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="shipping.isCOD"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-md border bg-white p-3 sm:col-span-2">
              <FormControl>
                <Checkbox
                  checked={Boolean(field.value)}
                  disabled={loading}
                  onCheckedChange={(checked) => setCOD(Boolean(checked))}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Pago contra entrega</FormLabel>
                <FormDescription>
                  La transportadora recauda al entregar; el método de pago
                  cambia a contra entrega.
                </FormDescription>
              </div>
            </FormItem>
          )}
        />
      </div>
      {carrierInfo && (
        <div className="flex items-center gap-3 rounded-md border bg-white p-3">
          <span
            className="flex h-10 w-16 shrink-0 items-center justify-center rounded-md p-1.5"
            style={{ backgroundColor: carrierInfo.color || "#FFFFFF" }}
          >
            <Image
              src={carrierInfo.logoUrl}
              alt={carrierInfo.comercialName}
              width={56}
              height={28}
              className="h-full w-full object-contain"
              unoptimized
            />
          </span>
          <span className="text-sm font-medium">
            {carrierInfo.comercialName}
          </span>
        </div>
      )}
    </div>
  );
}
