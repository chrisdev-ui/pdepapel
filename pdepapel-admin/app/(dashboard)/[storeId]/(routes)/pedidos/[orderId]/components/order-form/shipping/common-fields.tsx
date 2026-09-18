"use client";

import { CurrencyInput } from "@/components/ui/currency-input";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { shippingOptions } from "@/constants";
import { ShippingProvider } from "@prisma/client";
import { useFormContext } from "react-hook-form";

import type { OrderFormValues } from "../schema";

interface CommonShippingFieldsProps {
  provider: ShippingProvider;
  loading: boolean;
  hasGuide: boolean;
}

/** Costo, estado y nota: los mismos tres campos con cualquier tipo de envío. */
export function CommonShippingFields({
  provider,
  loading,
  hasGuide,
}: CommonShippingFieldsProps) {
  const form = useFormContext<OrderFormValues>();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <FormField
        control={form.control}
        name="shipping.cost"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Costo que paga el cliente</FormLabel>
            <FormControl>
              <CurrencyInput
                placeholder="$ 0"
                disabled={loading || hasGuide}
                value={field.value}
                onChange={field.onChange}
              />
            </FormControl>
            <FormDescription>
              {provider === ShippingProvider.NONE
                ? "Solo si se cobra algo por la entrega."
                : provider === ShippingProvider.ENVIOCLICK
                  ? "Lo llena la tarifa elegida; cámbialo si asumes parte del flete."
                  : "Lo que se le cobra al cliente por el envío."}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="shipping.status"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Estado del envío</FormLabel>
            <Select
              disabled={loading}
              onValueChange={field.onChange}
              value={field.value}
              defaultValue={field.value}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Elige un estado" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {Object.entries(shippingOptions).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="shipping.notes"
        render={({ field }) => (
          <FormItem className="sm:col-span-2">
            <FormLabel>Nota para el cliente</FormLabel>
            <FormControl>
              <Textarea
                disabled={loading}
                rows={2}
                placeholder={
                  provider === ShippingProvider.NONE
                    ? "Ej: Listo para recoger mañana después de las 2 p. m."
                    : "Ej: Entregar en la portería"
                }
                {...field}
                value={field.value ?? ""}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
