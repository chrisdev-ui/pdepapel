"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { Color } from "@prisma/client";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AttributeCareCard } from "@/components/ui/attribute-care-card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { FormPageHeader, FormStickyFooter, UsageList } from "@/components/ui/form-page-chrome";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import { TintBadge } from "@/components/ui/tint-badge";
import { useFormPersist } from "@/hooks/use-form-persist";
import { useFormValidationToast } from "@/hooks/use-form-validation-toast";
import { useToast } from "@/hooks/use-toast";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { getErrorMessage } from "@/lib/api-errors";

/** `#RGB`, `#RRGGBB` o `#RRGGBBAA`, como lo guardan los colores existentes. */
export const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const formSchema = z.object({
  name: z.string().trim().min(1, "Escribe el nombre del color").max(60, "Máximo 60 caracteres"),
  value: z
    .string()
    .trim()
    .regex(HEX_COLOR_PATTERN, "Escribe un color hexadecimal, por ejemplo #F5A3C7"),
});

type ColorFormValues = z.infer<typeof formSchema>;

export interface ColorUsage {
  activeProducts: number;
  archivedProducts: number;
}

interface ColorFormProps {
  initialData: Color | null;
  usage: ColorUsage;
}

const plural = (count: number, singular: string, pluralForm: string) => `${count} ${count === 1 ? singular : pluralForm}`;

/** Convierte `#RGB`/`#RRGGBBAA` al `#RRGGBB` que acepta `<input type="color">`. */
function toPickerHex(value: string): string {
  const hex = value.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  if (/^#[0-9a-fA-F]{6,8}$/.test(hex)) return hex.slice(0, 7);
  return "#ffffff";
}

export const ColorForm: React.FC<ColorFormProps> = ({ initialData, usage }) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const storeId = String(params.storeId);
  const hubHref = `/${storeId}/atributos?tab=colores${initialData?.isArchived ? "&vista=archivados" : ""}`;

  const [loading, setLoading] = useState(false);

  const defaultValues = useMemo<ColorFormValues>(
    () => ({ name: initialData?.name ?? "", value: initialData?.value ?? "" }),
    [initialData],
  );

  const form = useForm<ColorFormValues>({ resolver: zodResolver(formSchema), defaultValues });
  const { clearStorage } = useFormPersist({
    form,
    key: `color-form-${storeId}-${initialData?.id ?? "new"}`,
    enabled: !initialData,
  });
  useFormValidationToast({ form });
  const { confirmLeave, confirmationDialog: leaveDialog } = useUnsavedChangesGuard(form, { enabled: !loading });

  const value = form.watch("value");
  const validHex = HEX_COLOR_PATTERN.test(value.trim());
  const productsTotal = usage.activeProducts + usage.archivedProducts;

  const goToHub = () => {
    router.refresh();
    router.push(hubHref);
  };

  const onSubmit = async (data: ColorFormValues) => {
    const payload = { name: data.name, value: data.value.toUpperCase() };
    try {
      setLoading(true);
      if (initialData) {
        await axios.patch(`/api/${storeId}/colors/${initialData.id}`, payload);
      } else {
        await axios.post(`/api/${storeId}/colors`, payload);
      }
      clearStorage();
      form.reset(data);
      goToHub();
      toast({ description: initialData ? "Color actualizado" : "Color creado", variant: "success" });
    } catch (error) {
      toast({
        title: initialData ? "No se pudo guardar el color" : "No se pudo crear el color",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async () => {
    if (!initialData) return;
    try {
      setLoading(true);
      await axios.delete(`/api/${storeId}/colors/${initialData.id}`);
      goToHub();
      toast({ description: "Color eliminado", variant: "success" });
    } catch (error) {
      toast({ title: "No se pudo eliminar el color", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const canDelete = Boolean(initialData) && productsTotal === 0;
  const summary = initialData
    ? `${initialData.name} · ${initialData.value} · ${plural(productsTotal, "producto", "productos")}`
    : "Un color con su muestra, para variantes y filtros de la tienda.";

  return (
    <>
      {leaveDialog}
      <FormPageHeader
        title={initialData ? initialData.name : "Nuevo color"}
        badge={initialData ? <TintBadge label={initialData.isArchived ? "Archivado" : "Activo"} tone={initialData.isArchived ? "slate" : "mint"} /> : null}
        summary={summary}
        backLabel="Volver a Atributos"
        onBack={async () => {
          if (await confirmLeave()) router.push(hubHref);
        }}
      />

      <div className={initialData ? "grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]" : "grid gap-5"}>
        <Form {...form}>
          <form id="color-form" noValidate autoComplete="off" onSubmit={form.handleSubmit(onSubmit)} className="flex min-w-0 flex-col gap-5">
            <SectionCard id="datos" title="Datos" description="Nombre visible y valor hexadecimal de la muestra.">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>Nombre</FormLabel>
                      <FormControl>
                        <Input disabled={loading} placeholder="Ej. Rosa pastel" maxLength={60} {...field} />
                      </FormControl>
                      <FormDescription>Nunca se agrega solo al título del producto.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>Valor hexadecimal</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-3">
                          <Input disabled={loading} placeholder="#F5A3C7" maxLength={9} className="font-mono uppercase" {...field} />
                          <label className="relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border" title="Elegir con el selector de color">
                            <span
                              className="h-8 w-8 rounded-full border"
                              style={{ backgroundColor: validHex ? value.trim() : "transparent" }}
                              data-testid="color-swatch"
                              aria-hidden="true"
                            />
                            <input
                              type="color"
                              aria-label="Selector de color"
                              disabled={loading}
                              value={toPickerHex(value)}
                              onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            />
                          </label>
                        </div>
                      </FormControl>
                      <FormDescription>Con numeral, 3 o 6 dígitos. Puedes elegirlo con el círculo.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </SectionCard>

            <FormStickyFooter note={initialData ? "Los cambios se ven en los filtros de la tienda al guardar." : "El color queda disponible en los formularios de producto al crearlo."}>
              <Button type="submit" form="color-form" isLoading={loading} loadingText={initialData ? "Guardando…" : "Creando…"}>
                {initialData ? "Guardar cambios" : "Crear color"}
              </Button>
            </FormStickyFooter>
          </form>
        </Form>

        {initialData && (
          <div className="flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start">
            <SectionCard id="uso" title="Uso" description="Productos que tienen este color.">
              <UsageList
                items={[
                  { label: "Productos activos", value: usage.activeProducts },
                  { label: "Productos archivados", value: usage.archivedProducts },
                ]}
              />
            </SectionCard>
            <AttributeCareCard
              kind="colors"
              storeId={storeId}
              entity={initialData}
              noun="el color"
              hubHref={`/${storeId}/atributos?tab=colores${initialData.isArchived ? "" : "&vista=archivados"}`}
              canDelete={canDelete}
              deleteDescription={
                canDelete
                  ? "Ningún producto lo usa: se puede eliminar de inmediato. Esta acción no se puede deshacer."
                  : `No se puede eliminar: ${plural(productsTotal, "producto lo usa", "productos lo usan")} (incluidos los archivados). Archívalo para que deje de ofrecerse.`
              }
              deleteConfirmTitle={`¿Eliminar el color «${initialData.name}»?`}
              deleteConfirmDescription="Se elimina de inmediato y no se puede deshacer."
              onDelete={onDelete}
              disabled={loading}
            />
          </div>
        )}
      </div>
    </>
  );
};
