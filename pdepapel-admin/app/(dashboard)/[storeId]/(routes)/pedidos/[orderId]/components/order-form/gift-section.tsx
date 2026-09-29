"use client";

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { GIFT_MESSAGE_MAX } from "@/lib/gift-orders";
import { useFormContext, useWatch } from "react-hook-form";

import type { OrderFormValues } from "./schema";
import { SectionCard } from "./section-card";

interface GiftSectionProps {
  loading: boolean;
}

/**
 * Regalo: quién lo recibe. El cliente de la sección 1 sigue siendo quien
 * compra (a su correo va el recibo completo); aquí va la otra persona, a
 * cuyo nombre sale la guía y a cuyo correo llega solo un aviso sin
 * productos ni precios, y solo con el pago confirmado.
 */
export function GiftSection({ loading }: GiftSectionProps) {
  const form = useFormContext<OrderFormValues>();
  const isGift = useWatch({ control: form.control, name: "isGift" });
  const message = useWatch({ control: form.control, name: "giftMessage" });

  return (
    <SectionCard
      id="regalo"
      title="Regalo"
      description="Si el pedido es para otra persona: la guía sale a su nombre y le llega un aviso sin productos ni precios cuando el pago esté confirmado."
    >
      <FormField
        control={form.control}
        name="isGift"
        render={({ field }) => (
          <FormItem className="flex items-center justify-between gap-4 space-y-0 rounded-lg border p-3">
            <div className="space-y-0.5">
              <FormLabel htmlFor="pedido-es-regalo">Es un regalo</FormLabel>
              <FormDescription>
                El recibo completo sigue yendo al correo del cliente.
              </FormDescription>
            </div>
            <FormControl>
              <Switch
                id="pedido-es-regalo"
                checked={Boolean(field.value)}
                onCheckedChange={field.onChange}
                disabled={loading}
                aria-label="Es un regalo"
              />
            </FormControl>
          </FormItem>
        )}
      />
      {isGift && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <FormField
            control={form.control}
            name="giftRecipientName"
            render={({ field }) => (
              <FormItem className="sm:col-span-2 lg:col-span-1">
                <FormLabel isRequired>Quién lo recibe</FormLabel>
                <FormControl>
                  <Input
                    disabled={loading}
                    placeholder="Nombre de quien recibe el regalo"
                    autoComplete="off"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>
                  La guía de envío sale a este nombre.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
                control={form.control}
                name="giftRecipientEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Su correo</FormLabel>
                    <FormControl>
                      <Input
                        disabled={loading}
                        type="email"
                        inputMode="email"
                        placeholder="Opcional"
                        autoComplete="off"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormDescription>
                      Recibe un aviso sin productos ni precios, solo cuando el
                      pedido esté pagado.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="giftRecipientPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Su teléfono</FormLabel>
                    <FormControl>
                      <PhoneInput
                        disabled={loading}
                        placeholder="Opcional"
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        defaultCountry="CO"
                      />
                    </FormControl>
                    <FormDescription>
                      Para la transportadora; si falta, usa el del cliente.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
          <FormField
            control={form.control}
            name="giftMessage"
            render={({ field }) => (
              <FormItem className="sm:col-span-2 lg:col-span-1">
                <FormLabel>Mensaje</FormLabel>
                <FormControl>
                  <Textarea
                    disabled={loading}
                    rows={3}
                    maxLength={GIFT_MESSAGE_MAX}
                    placeholder="Lo que quiere decirle quien regala (opcional)"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>
                  Va en el aviso a quien recibe. {(message ?? "").length}/
                  {GIFT_MESSAGE_MAX}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}
    </SectionCard>
  );
}
