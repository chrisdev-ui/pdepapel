"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { Size } from "@prisma/client";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AttributeCareCard } from "@/components/ui/attribute-care-card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { FormPageHeader, FormStickyFooter, UsageList } from "@/components/ui/form-page-chrome";
import { SectionCard } from "@/components/ui/section-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TintBadge } from "@/components/ui/tint-badge";
import { DIMENSIONS, WEIGHTS, generateSizeName, generateSizeValue, parseSizeValue } from "@/constants/sizes";
import { useFormPersist } from "@/hooks/use-form-persist";
import { useFormValidationToast } from "@/hooks/use-form-validation-toast";
import { useToast } from "@/hooks/use-toast";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { getErrorMessage } from "@/lib/api-errors";

const formSchema = z.object({
  dimension: z.string().min(1, "Elige la dimensión"),
  weight: z.string().min(1, "Elige el peso"),
  name: z.string().trim().min(1, "El nombre se genera al elegir dimensión y peso"),
  value: z.string().trim().min(1, "El código se genera al elegir dimensión y peso"),
});

type SizeFormValues = z.infer<typeof formSchema>;

export interface SizeUsage {
  activeProducts: number;
  archivedProducts: number;
}

interface SizeFormProps {
  initialData: Size | null;
  usage: SizeUsage;
}

const plural = (count: number, singular: string, pluralForm: string) => `${count} ${count === 1 ? singular : pluralForm}`;

export const SizeForm: React.FC<SizeFormProps> = ({ initialData, usage }) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const storeId = String(params.storeId);
  const hubHref = `/${storeId}/atributos?tab=tamanos${initialData?.isArchived ? "&vista=archivados" : ""}`;

  const [loading, setLoading] = useState(false);

  const defaultValues = useMemo<SizeFormValues>(() => {
    const parsed = initialData ? parseSizeValue(initialData.value) : null;
    return {
      dimension: parsed?.dimension ?? "",
      weight: parsed?.weight ?? "",
      name: initialData?.name ?? "",
      value: initialData?.value ?? "",
    };
  }, [initialData]);

  const form = useForm<SizeFormValues>({ resolver: zodResolver(formSchema), defaultValues });
  const { clearStorage } = useFormPersist({
    form,
    key: `size-form-${storeId}-${initialData?.id ?? "new"}`,
    enabled: !initialData,
  });
  useFormValidationToast({ form });
  const { confirmLeave, confirmationDialog: leaveDialog } = useUnsavedChangesGuard(form, { enabled: !loading });

  const dimension = form.watch("dimension");
  const weight = form.watch("weight");
  const name = form.watch("name");
  const value = form.watch("value");
  const productsTotal = usage.activeProducts + usage.archivedProducts;

  // Nombre y código salen de la combinación; nunca se escriben a mano.
  useEffect(() => {
    if (!dimension || !weight) return;
    try {
      const nextName = generateSizeName(dimension, weight);
      const nextValue = generateSizeValue(dimension, weight);
      if (form.getValues("name") !== nextName) form.setValue("name", nextName, { shouldDirty: true, shouldValidate: true });
      if (form.getValues("value") !== nextValue) form.setValue("value", nextValue, { shouldDirty: true, shouldValidate: true });
    } catch (error) {
      console.error("No se pudo generar el tamaño:", error);
    }
  }, [dimension, weight, form]);

  const goToHub = () => {
    router.refresh();
    router.push(hubHref);
  };

  const onSubmit = async (data: SizeFormValues) => {
    // La API solo recibe nombre y código; dimensión y peso son ayuda del formulario.
    const payload = { name: data.name, value: data.value };
    try {
      setLoading(true);
      if (initialData) {
        await axios.patch(`/api/${storeId}/sizes/${initialData.id}`, payload);
      } else {
        await axios.post(`/api/${storeId}/sizes`, payload);
      }
      clearStorage();
      form.reset(data);
      goToHub();
      toast({ description: initialData ? "Tamaño actualizado" : "Tamaño creado", variant: "success" });
    } catch (error) {
      toast({
        title: initialData ? "No se pudo guardar el tamaño" : "No se pudo crear el tamaño",
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
      await axios.delete(`/api/${storeId}/sizes/${initialData.id}`);
      goToHub();
      toast({ description: "Tamaño eliminado", variant: "success" });
    } catch (error) {
      toast({ title: "No se pudo eliminar el tamaño", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const canDelete = Boolean(initialData) && productsTotal === 0;
  const summary = initialData
    ? `${initialData.name} · ${initialData.value} · ${plural(productsTotal, "producto", "productos")}`
    : "Tamaño interno para envíos y SKU: combina una dimensión y un peso. Lo que el cliente ve como medida vive en Opciones para clientes.";

  return (
    <>
      {leaveDialog}
      <FormPageHeader
        title={initialData ? initialData.name : "Nuevo tamaño"}
        badge={initialData ? <TintBadge label={initialData.isArchived ? "Archivado" : "Activo"} tone={initialData.isArchived ? "slate" : "mint"} /> : null}
        summary={summary}
        backLabel="Volver a Atributos"
        onBack={async () => {
          if (await confirmLeave()) router.push(hubHref);
        }}
      />

      <div className={initialData ? "grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]" : "grid gap-5"}>
        <Form {...form}>
          <form id="size-form" noValidate autoComplete="off" onSubmit={form.handleSubmit(onSubmit)} className="flex min-w-0 flex-col gap-5">
            <SectionCard id="combinacion" title="Dimensión y peso" description="El nombre y el código del tamaño salen de esta combinación.">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="dimension"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>Dimensión</FormLabel>
                      <Select disabled={loading} onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger aria-label="Dimensión">
                            <SelectValue placeholder="Elige la dimensión" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {DIMENSIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.value} · {option.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>Qué tan grande es el producto (XS a XL).</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="weight"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>Peso</FormLabel>
                      <Select disabled={loading} onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger aria-label="Peso">
                            <SelectValue placeholder="Elige el peso" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {WEIGHTS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.value} · {option.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>Liviano o pesado, para cotizar el envío.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <dl className="grid gap-x-6 gap-y-1 rounded-lg bg-muted/40 p-3 text-xs sm:grid-cols-2" data-testid="size-preview">
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-muted-foreground">Nombre</dt>
                  <dd className="font-medium text-foreground">{name || "—"}</dd>
                </div>
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-muted-foreground">Código (SKU y envíos)</dt>
                  <dd className="font-medium text-foreground">{value || "—"}</dd>
                </div>
                <div className="text-muted-foreground sm:col-span-2">El código nunca se muestra al cliente ni en Google Merchant.</div>
              </dl>
              {/* Los campos generados viajan ocultos; los valores visibles están en la vista previa. */}
              <FormField control={form.control} name="name" render={({ field }) => (<FormItem className="hidden"><FormControl><input type="hidden" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="value" render={({ field }) => (<FormItem className="hidden"><FormControl><input type="hidden" {...field} /></FormControl><FormMessage /></FormItem>)} />
            </SectionCard>

            <FormStickyFooter note={initialData ? "Cambiar la combinación cambia el código; los productos que lo usan siguen apuntando a este tamaño." : "El tamaño queda disponible en los formularios de producto al crearlo."}>
              <Button type="submit" form="size-form" isLoading={loading} loadingText={initialData ? "Guardando…" : "Creando…"}>
                {initialData ? "Guardar cambios" : "Crear tamaño"}
              </Button>
            </FormStickyFooter>
          </form>
        </Form>

        {initialData && (
          <div className="flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start">
            <SectionCard id="uso" title="Uso" description="Productos que tienen este tamaño interno.">
              <UsageList
                items={[
                  { label: "Productos activos", value: usage.activeProducts },
                  { label: "Productos archivados", value: usage.archivedProducts },
                ]}
              />
            </SectionCard>
            <AttributeCareCard
              kind="sizes"
              storeId={storeId}
              entity={initialData}
              noun="el tamaño"
              hubHref={`/${storeId}/atributos?tab=tamanos${initialData.isArchived ? "" : "&vista=archivados"}`}
              canDelete={canDelete}
              deleteDescription={
                canDelete
                  ? "Ningún producto lo usa: se puede eliminar de inmediato. Esta acción no se puede deshacer."
                  : `No se puede eliminar: ${plural(productsTotal, "producto lo usa", "productos lo usan")} (incluidos los archivados). Archívalo para que deje de ofrecerse.`
              }
              deleteConfirmTitle={`¿Eliminar el tamaño «${initialData.name}»?`}
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
