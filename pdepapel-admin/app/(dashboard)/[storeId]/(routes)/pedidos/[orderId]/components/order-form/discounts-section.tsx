"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { PercentageInput } from "@/components/ui/percentage-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { discountOptions } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { currencyFormatter } from "@/lib/utils";
import { DiscountType, type Coupon } from "@prisma/client";
import axios from "axios";
import { Check, Lock, Ticket, Trash } from "lucide-react";
import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import type { OrderFormValues } from "./schema";
import { SectionCard } from "./section-card";

interface DiscountsSectionProps {
  storeId: string;
  availableCoupons: Coupon[];
  coupon: Coupon | null;
  setCoupon: (coupon: Coupon | null) => void;
  initialCoupon: Coupon | null;
  subtotal: number;
  locked: boolean;
  loading: boolean;
}

export function DiscountsSection({
  storeId,
  availableCoupons,
  coupon,
  setCoupon,
  initialCoupon,
  subtotal,
  locked,
  loading,
}: DiscountsSectionProps) {
  const form = useFormContext<OrderFormValues>();
  const { toast } = useToast();
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const discountType = useWatch({
    control: form.control,
    name: "discount.type",
  });
  const disabled = loading || locked;

  if (locked) {
    const amount = form.getValues("discount.amount");
    return (
      <SectionCard
        id="descuentos"
        title="Descuentos y cupones"
        description="Pagado: el descuento ya se cobró y no cambia."
        action={
          <Lock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        }
      >
        <p className="text-sm text-muted-foreground">
          {discountType
            ? `Descuento ${discountType === DiscountType.PERCENTAGE ? `${amount}%` : currencyFormatter(Number(amount ?? 0))}`
            : "Sin descuento manual"}
          {coupon ? ` · cupón ${coupon.code}` : " · sin cupón"}
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      id="descuentos"
      title="Descuentos y cupones"
      description="Se aplican sobre el subtotal de productos. O descuento manual o cupón, no ambos."
      action={
        discountType ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={disabled}
            onClick={() => {
              form.resetField("discount.type");
              form.resetField("discount.amount", { defaultValue: 0 });
              form.resetField("discount.reason", { defaultValue: "" });
              toast({ description: "Descuento eliminado", variant: "success" });
            }}
          >
            <Trash className="h-3.5 w-3.5" aria-hidden="true" />
            Quitar descuento
          </Button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FormField
          control={form.control}
          name="discount.type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo de descuento</FormLabel>
              <Select
                key={field.value ?? "none"}
                disabled={disabled || Boolean(coupon)}
                onValueChange={field.onChange}
                value={field.value || ""}
                defaultValue={field.value || ""}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin descuento" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={DiscountType.PERCENTAGE}>
                    {discountOptions[DiscountType.PERCENTAGE]}
                  </SelectItem>
                  <SelectItem value={DiscountType.FIXED}>
                    {discountOptions[DiscountType.FIXED]}
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="discount.amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {discountType === DiscountType.PERCENTAGE
                  ? "Porcentaje"
                  : "Monto"}
              </FormLabel>
              <FormControl>
                {discountType === DiscountType.PERCENTAGE ? (
                  <PercentageInput
                    disabled={disabled || !discountType}
                    placeholder="10"
                    value={field.value}
                    onChange={field.onChange}
                    max={100}
                  />
                ) : (
                  <CurrencyInput
                    placeholder="$ 10.000"
                    disabled={disabled || !discountType}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="discount.reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Motivo</FormLabel>
              <FormControl>
                <Textarea
                  disabled={disabled || !discountType}
                  rows={1}
                  placeholder="Ej: Cliente frecuente"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="couponCode"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel className="flex items-center gap-2">
                Cupón
                {coupon && (
                  <Badge variant="success" className="flex items-center gap-1">
                    <Check className="h-3 w-3" aria-hidden="true" />
                    Aplicado
                  </Badge>
                )}
              </FormLabel>
              <div className="flex items-center gap-2">
                <FormControl>
                  <Combobox
                    id="pedido-cupon"
                    aria-label="Cupón"
                    options={availableCoupons.map((c) => ({
                      value: c.code,
                      label: c.code,
                      description:
                        c.type === DiscountType.PERCENTAGE
                          ? `${c.amount} % de descuento`
                          : `${currencyFormatter(Number(c.amount))} de descuento`,
                      icon: (
                        <Ticket
                          className="h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      ),
                    }))}
                    value={field.value || null}
                    placeholder={
                      availableCoupons.length > 0
                        ? "Elegir cupón"
                        : "No hay cupones"
                    }
                    searchPlaceholder="Buscar cupón…"
                    emptyText="No se encontraron cupones."
                    disabled={
                      validatingCoupon ||
                      disabled ||
                      Boolean(discountType) ||
                      availableCoupons.length === 0
                    }
                    onChange={async (code) => {
                      if (!code) {
                        setCoupon(null);
                        field.onChange("");
                        return;
                      }
                      try {
                        setValidatingCoupon(true);
                        if (!initialCoupon || initialCoupon.code !== code) {
                          const response = await axios.post(
                            `/api/${storeId}/coupons/validate`,
                            { code, subtotal },
                          );
                          setCoupon(response.data);
                        } else {
                          setCoupon(initialCoupon);
                        }
                        field.onChange(code);
                        toast({
                          description: "Cupón aplicado",
                          variant: "success",
                        });
                      } catch (error) {
                        toast({
                          description: getErrorMessage(error),
                          variant: "destructive",
                        });
                        setCoupon(null);
                        field.onChange("");
                      } finally {
                        setValidatingCoupon(false);
                      }
                    }}
                  />
                </FormControl>
                {coupon && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Quitar cupón"
                    disabled={disabled}
                    onClick={() => {
                      setCoupon(null);
                      field.onChange("");
                      toast({
                        description: "Cupón quitado",
                        variant: "success",
                      });
                    }}
                  >
                    <Trash className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </SectionCard>
  );
}
