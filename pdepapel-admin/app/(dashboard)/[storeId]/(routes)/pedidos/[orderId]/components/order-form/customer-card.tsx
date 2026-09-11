"use client";

import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { format, parseISO } from "date-fns";
import { toDateInputValue } from "@/lib/date-input";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  LocationCombobox,
  type LocationOption,
} from "@/components/ui/location-combobox";
import { PhoneInput } from "@/components/ui/phone-input";
import { Textarea } from "@/components/ui/textarea";
import { UserCombobox } from "@/components/ui/user-combobox";
import { WhatsappButton } from "@/components/whatsapp-button";
import { useToast } from "@/hooks/use-toast";
import { OrderStatus, OrderType } from "@prisma/client";
import axios from "axios";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import type { GetOrderResult } from "../../server/get-order";
import type { OrderFormValues } from "./schema";
import { SectionCard } from "./section-card";

export interface CustomerOption {
  value: string;
  label: string;
  image?: string;
  email?: string;
  phone?: string;
  documentId?: string;
}

interface CustomerCardProps {
  storeId: string;
  users: CustomerOption[];
  locations: LocationOption[];
  loading: boolean;
  initialData: GetOrderResult["order"];
  total: number;
}

/**
 * Quién compra y a dónde va. Al elegir un cliente conocido se traen sus
 * datos y la dirección de su último pedido; nada se borra hasta tener la
 * respuesta, para no dejar el formulario más vacío de lo que estaba.
 */
export function CustomerCard({
  storeId,
  users,
  locations,
  loading,
  initialData,
  total,
}: CustomerCardProps) {
  const form = useFormContext<OrderFormValues>();
  const { toast } = useToast();
  const [moreAddress, setMoreAddress] = useState(
    Boolean(
      initialData?.address2 ||
      initialData?.neighborhood ||
      initialData?.addressReference ||
      initialData?.company,
    ),
  );
  const type = useWatch({ control: form.control, name: "type" });
  const guestId = useWatch({ control: form.control, name: "guestId" });
  const fullName = useWatch({ control: form.control, name: "fullName" });
  const items = useWatch({ control: form.control, name: "orderItems" });

  const handleUserSelect = async (
    rawId: string,
    user: CustomerOption | undefined,
  ) => {
    let finalUserId = rawId;
    let finalGuestId = "";
    if (rawId?.startsWith("clerk_")) finalUserId = rawId.replace("clerk_", "");
    else if (rawId?.startsWith("guest_")) {
      finalUserId = "";
      finalGuestId = rawId;
    }
    form.setValue("userId", finalUserId ?? "");
    form.setValue("guestId", finalGuestId);
    if (!rawId || !user) return;

    const options = { shouldValidate: true, shouldDirty: true };
    const cleanName =
      (user.label || "").replace(/\s*\(\+?[\d\s.-]+\)\s*/g, "").trim() ||
      user.label ||
      "Cliente";
    form.setValue("fullName", cleanName, options);
    if (user.email) form.setValue("email", user.email, options);
    if (user.phone) form.setValue("phone", user.phone, options);
    if (user.documentId) form.setValue("documentId", user.documentId, options);

    try {
      const lookupId = rawId.startsWith("clerk_") ? finalUserId : rawId;
      const response = await axios.get(
        `/api/${storeId}/customers/${lookupId}/last-order`,
      );
      const lastOrder = response.data;
      if (lastOrder && Object.keys(lastOrder).length > 0) {
        const addressFields = [
          "address",
          "city",
          "department",
          "daneCode",
          "neighborhood",
          "addressReference",
          "address2",
          "company",
        ] as const;
        for (const key of addressFields) {
          if (lastOrder[key]) form.setValue(key, lastOrder[key], options);
        }
        if (!user.email && lastOrder.email)
          form.setValue("email", lastOrder.email, options);
        if (!user.phone && lastOrder.phone)
          form.setValue("phone", lastOrder.phone, options);
        if (!user.documentId && lastOrder.documentId)
          form.setValue("documentId", lastOrder.documentId, options);
        if (lastOrder.fullName)
          form.setValue("fullName", lastOrder.fullName, options);
        if (
          lastOrder.address2 ||
          lastOrder.neighborhood ||
          lastOrder.addressReference ||
          lastOrder.company
        )
          setMoreAddress(true);
        toast({
          description: "Datos y dirección del último pedido cargados.",
          variant: "success",
        });
      }
    } catch (error) {
      console.error("Error loading last order:", error);
    }
  };

  return (
    <SectionCard
      id="cliente"
      title="Cliente"
      description="Quién compra y a dónde va."
    >
      <div className="grid grid-cols-1 gap-4">
        <FormField
          control={form.control}
          name="userId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cliente conocido</FormLabel>
              <FormControl>
                <UserCombobox
                  options={users}
                  value={field.value || guestId}
                  onChange={(value, user) => {
                    field.onChange(value);
                    void handleUserSelect(
                      value,
                      user as CustomerOption | undefined,
                    );
                  }}
                  disabled={loading}
                />
              </FormControl>
              <FormDescription>
                Trae sus datos y su última dirección.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel isRequired>Nombre</FormLabel>
              <FormControl>
                <Input
                  disabled={loading}
                  placeholder="Nombre completo"
                  autoComplete="off"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel isRequired>Teléfono</FormLabel>
              <FormControl>
                <div className="flex items-center gap-x-1">
                  {(initialData ||
                    (field.value && field.value.length >= 10)) && (
                    <WhatsappButton
                      order={{
                        orderNumber: initialData?.orderNumber ?? "",
                        status: initialData?.status ?? OrderStatus.CREATED,
                        fullName: initialData?.fullName ?? fullName ?? "",
                        phone: field.value || "",
                        totalPrice: total,
                        products: (items ?? []).map((item) => ({
                          name: item.name,
                          quantity: item.quantity,
                        })),
                      }}
                      size="md"
                    />
                  )}
                  <PhoneInput
                    disabled={loading}
                    placeholder=""
                    value={field.value}
                    onChange={field.onChange}
                    defaultCountry="CO"
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel isRequired>Correo</FormLabel>
                <FormControl>
                  <Input
                    disabled={loading}
                    type="email"
                    inputMode="email"
                    placeholder="cliente@correo.com"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="documentId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Documento</FormLabel>
                <FormControl>
                  <Input
                    disabled={loading}
                    inputMode="numeric"
                    placeholder="Cédula o NIT"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="daneCode"
          render={({ field }) => (
            <FormItem>
              <FormLabel isRequired>Ciudad</FormLabel>
              <FormControl>
                <LocationCombobox
                  options={locations}
                  value={field.value || ""}
                  onChange={(value, location) => {
                    field.onChange(value);
                    if (location) {
                      form.setValue("city", location.city, {
                        shouldDirty: true,
                      });
                      form.setValue("department", location.department, {
                        shouldDirty: true,
                      });
                    }
                  }}
                  disabled={loading}
                  placeholder="Buscar ciudad…"
                />
              </FormControl>
              <FormDescription>
                Necesaria para cotizar el envío.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel isRequired>Dirección</FormLabel>
              <FormControl>
                <Input
                  disabled={loading}
                  placeholder="Ej: Calle 123 #45-67"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <button
          type="button"
          onClick={() => setMoreAddress((value) => !value)}
          aria-expanded={moreAddress}
          className="flex h-9 items-center gap-1 self-start text-sm font-semibold text-primary hover:underline"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${moreAddress ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
          {moreAddress ? "Menos datos de entrega" : "Más datos de entrega"}
        </button>
        {moreAddress && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <FormField
              control={form.control}
              name="address2"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Apartamento, torre, oficina</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Ej: Apto 501, Torre B"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="neighborhood"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Barrio</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Ej: Laureles"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="addressReference"
              render={({ field }) => (
                <FormItem className="sm:col-span-2 lg:col-span-1">
                  <FormLabel>Referencia</FormLabel>
                  <FormControl>
                    <Textarea
                      disabled={loading}
                      rows={2}
                      placeholder="Ej: Frente al parque, edificio azul"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="company"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Empresa</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Si factura a nombre de una empresa"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}
        {type === OrderType.QUOTATION && (
          <FormField
            control={form.control}
            name="expiresAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cotización válida hasta</FormLabel>
                <FormControl>
                  <DateField
                    id="cotizacion-vence"
                    value={toDateInputValue(field.value)}
                    onChange={(iso) =>
                      field.onChange(iso ? parseISO(iso) : undefined)
                    }
                    disabled={loading}
                    placeholder="Fecha de vencimiento"
                    min={format(new Date(), "yyyy-MM-dd")}
                    clearable
                    aria-label="Cotización válida hasta"
                  />
                </FormControl>
                <FormDescription>
                  Pasada esta fecha el enlace deja de aceptar.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </div>
    </SectionCard>
  );
}
