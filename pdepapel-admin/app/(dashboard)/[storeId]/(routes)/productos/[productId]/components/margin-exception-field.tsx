"use client";

import { useFormContext } from "react-hook-form";

import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { MARGIN_EXCEPTION_MAX_LENGTH } from "@/lib/margin-exception";

export interface MarginExceptionFormValues {
  marginExceptionEnabled?: boolean;
  marginExceptionReason?: string | null;
}

/**
 * «Excepción de margen» de la ficha: solo aparece cuando el precio queda bajo
 * el margen mínimo de la tienda. Marcada, el motivo es obligatorio; nunca
 * bloquea guardar un precio bajo el mínimo.
 */
export function MarginExceptionField({ visible, disabled }: { visible: boolean; disabled?: boolean }) {
  const form = useFormContext<MarginExceptionFormValues>();
  const enabled = Boolean(form.watch("marginExceptionEnabled"));
  if (!visible) return null;

  return (
    <div className="col-span-full flex flex-col gap-2 rounded-lg border border-dashed p-3" data-testid="margin-exception">
      <FormField
        control={form.control}
        name="marginExceptionEnabled"
        render={({ field }) => (
          <FormItem className="space-y-0">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
              <FormControl>
                <Checkbox
                  checked={Boolean(field.value)}
                  disabled={disabled}
                  onCheckedChange={(checked) => {
                    field.onChange(checked === true);
                    if (checked !== true) form.clearErrors("marginExceptionReason");
                  }}
                />
              </FormControl>
              Precio bajo a propósito
            </label>
          </FormItem>
        )}
      />
      {enabled ? (
        <FormField
          control={form.control}
          name="marginExceptionReason"
          render={({ field }) => (
            <FormItem>
              <FormLabel isRequired>Motivo</FormLabel>
              <FormControl>
                <Input
                  className="h-11"
                  placeholder="Ej.: precio competitivo, estrategia de volumen"
                  maxLength={MARGIN_EXCEPTION_MAX_LENGTH}
                  disabled={disabled}
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : null}
    </div>
  );
}
