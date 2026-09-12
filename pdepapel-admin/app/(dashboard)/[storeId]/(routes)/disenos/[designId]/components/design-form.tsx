"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { Design } from "@prisma/client";
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

const formSchema = z.object({
  name: z.string().trim().min(1, "Escribe el nombre del diseño").max(60, "Máximo 60 caracteres"),
});

type DesignFormValues = z.infer<typeof formSchema>;

export interface DesignUsage {
  activeProducts: number;
  archivedProducts: number;
}

interface DesignFormProps {
  initialData: Design | null;
  usage: DesignUsage;
}

const plural = (count: number, singular: string, pluralForm: string) => `${count} ${count === 1 ? singular : pluralForm}`;

export const DesignForm: React.FC<DesignFormProps> = ({ initialData, usage }) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const storeId = String(params.storeId);
  const hubHref = `/${storeId}/atributos?tab=disenos${initialData?.isArchived ? "&vista=archivados" : ""}`;

  const [loading, setLoading] = useState(false);

  const defaultValues = useMemo<DesignFormValues>(() => ({ name: initialData?.name ?? "" }), [initialData]);

  const form = useForm<DesignFormValues>({ resolver: zodResolver(formSchema), defaultValues });
  const { clearStorage } = useFormPersist({
    form,
    key: `design-form-${storeId}-${initialData?.id ?? "new"}`,
    enabled: !initialData,
  });
  useFormValidationToast({ form });
  const { confirmLeave, confirmationDialog: leaveDialog } = useUnsavedChangesGuard(form, { enabled: !loading });

  const productsTotal = usage.activeProducts + usage.archivedProducts;

  const goToHub = () => {
    router.refresh();
    router.push(hubHref);
  };

  const onSubmit = async (data: DesignFormValues) => {
    try {
      setLoading(true);
      if (initialData) {
        await axios.patch(`/api/${storeId}/designs/${initialData.id}`, data);
      } else {
        await axios.post(`/api/${storeId}/designs`, data);
      }
      clearStorage();
      form.reset(data);
      goToHub();
      toast({ description: initialData ? "Diseño actualizado" : "Diseño creado", variant: "success" });
    } catch (error) {
      toast({
        title: initialData ? "No se pudo guardar el diseño" : "No se pudo crear el diseño",
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
      await axios.delete(`/api/${storeId}/designs/${initialData.id}`);
      goToHub();
      toast({ description: "Diseño eliminado", variant: "success" });
    } catch (error) {
      toast({ title: "No se pudo eliminar el diseño", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const canDelete = Boolean(initialData) && productsTotal === 0;
  const summary = initialData
    ? `${initialData.name} · ${plural(productsTotal, "producto", "productos")}`
    : "Un diseño o personaje (Snoopy, Sanrio…) para variantes y filtros de la tienda.";

  return (
    <>
      {leaveDialog}
      <FormPageHeader
        title={initialData ? initialData.name : "Nuevo diseño"}
        badge={initialData ? <TintBadge label={initialData.isArchived ? "Archivado" : "Activo"} tone={initialData.isArchived ? "slate" : "mint"} /> : null}
        summary={summary}
        backLabel="Volver a Atributos"
        onBack={async () => {
          if (await confirmLeave()) router.push(hubHref);
        }}
      />

      <div className={initialData ? "grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]" : "grid gap-5"}>
        <Form {...form}>
          <form id="design-form" noValidate autoComplete="off" onSubmit={form.handleSubmit(onSubmit)} className="flex min-w-0 flex-col gap-5">
            <SectionCard id="datos" title="Datos" description="Cómo se llama el diseño en los formularios y en los filtros.">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="max-w-[560px]">
                    <FormLabel isRequired>Nombre</FormLabel>
                    <FormControl>
                      <Input disabled={loading} placeholder="Ej. Snoopy" maxLength={60} {...field} />
                    </FormControl>
                    <FormDescription>Nunca se agrega solo al título del producto.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </SectionCard>

            <FormStickyFooter note={initialData ? "Los cambios se ven en los filtros de la tienda al guardar." : "El diseño queda disponible en los formularios de producto al crearlo."}>
              <Button type="submit" form="design-form" isLoading={loading} loadingText={initialData ? "Guardando…" : "Creando…"}>
                {initialData ? "Guardar cambios" : "Crear diseño"}
              </Button>
            </FormStickyFooter>
          </form>
        </Form>

        {initialData && (
          <div className="flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start">
            <SectionCard id="uso" title="Uso" description="Productos que tienen este diseño.">
              <UsageList
                items={[
                  { label: "Productos activos", value: usage.activeProducts },
                  { label: "Productos archivados", value: usage.archivedProducts },
                ]}
              />
            </SectionCard>
            <AttributeCareCard
              kind="designs"
              storeId={storeId}
              entity={initialData}
              noun="el diseño"
              hubHref={`/${storeId}/atributos?tab=disenos${initialData.isArchived ? "" : "&vista=archivados"}`}
              canDelete={canDelete}
              deleteDescription={
                canDelete
                  ? "Ningún producto lo usa: se puede eliminar de inmediato. Esta acción no se puede deshacer."
                  : `No se puede eliminar: ${plural(productsTotal, "producto lo usa", "productos lo usan")} (incluidos los archivados). Archívalo para que deje de ofrecerse.`
              }
              deleteConfirmTitle={`¿Eliminar el diseño «${initialData.name}»?`}
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
