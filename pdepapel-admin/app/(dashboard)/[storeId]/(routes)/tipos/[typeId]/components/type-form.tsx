"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import dynamic from "next/dynamic";
import Link from "next/link";
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
import { Skeleton } from "@/components/ui/skeleton";
import { TintBadge } from "@/components/ui/tint-badge";
import { useFormPersist } from "@/hooks/use-form-persist";
import { useFormValidationToast } from "@/hooks/use-form-validation-toast";
import { useToast } from "@/hooks/use-toast";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { getErrorMessage } from "@/lib/api-errors";
import { ICON_SVG_MAX_LENGTH } from "@/lib/svg-icon";
import { LUCIDE_ICON_NAME_PATTERN, stripLeadingSymbol } from "@/lib/taxonomy-icons";

import type { TypeDetail } from "../server/get-type";

// El selector trae el índice completo de iconos de Lucide: solo en el cliente y bajo demanda.
const IconPicker = dynamic(() => import("@/components/ui/icon-picker"), {
  ssr: false,
  loading: () => <Skeleton className="h-64 max-w-[560px] rounded-xl" aria-label="Cargando iconos…" />,
});

export const TYPE_NAME_MAX_LENGTH = 60;

const formSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Escribe el nombre de la categoría")
    .max(TYPE_NAME_MAX_LENGTH, `Máximo ${TYPE_NAME_MAX_LENGTH} caracteres`),
  icon: z.string().regex(LUCIDE_ICON_NAME_PATTERN, "Elige un icono válido").nullable(),
  iconSvg: z.string().max(ICON_SVG_MAX_LENGTH, "El icono propio es demasiado grande").nullable(),
});

type TypeFormValues = z.infer<typeof formSchema>;

interface TypeFormProps {
  initialData: TypeDetail | null;
  aiIconConfigured: boolean;
}

const plural = (count: number, singular: string, pluralForm: string) => `${count} ${count === 1 ? singular : pluralForm}`;

/** Copia honesta de la tarjeta de cuidado según lo que cuelga de la categoría. */
export function describeTypeDeletion(type: Pick<TypeDetail, "categoriesCount" | "categoriesWithProducts">): {
  canDelete: boolean;
  description: string;
  confirmDescription: string;
} {
  if (type.categoriesCount === 0) {
    return {
      canDelete: true,
      description: "No tiene subcategorías: se puede eliminar de inmediato. Esta acción no se puede deshacer.",
      confirmDescription: "Se elimina de inmediato y no se puede deshacer.",
    };
  }
  const cascade = `Eliminar borra también sus ${plural(type.categoriesCount, "subcategoría", "subcategorías")} y solo es posible cuando ninguna tiene productos.`;
  if (type.categoriesWithProducts > 0) {
    return {
      canDelete: false,
      description: `${cascade} Con productos, archívala.`,
      confirmDescription: cascade,
    };
  }
  return {
    canDelete: true,
    description: `${cascade} Ninguna tiene productos, así que se puede eliminar; si prefieres conservarla, archívala.`,
    confirmDescription: `${cascade} Esta acción no se puede deshacer.`,
  };
}

export const TypeForm: React.FC<TypeFormProps> = ({ initialData, aiIconConfigured }) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const storeId = String(params.storeId);
  const hubHref = `/${storeId}/atributos?tab=categorias${initialData?.isArchived ? "&vista=archivados" : ""}`;

  const [loading, setLoading] = useState(false);

  const defaultValues = useMemo<TypeFormValues>(
    () => ({
      name: initialData?.name ?? "",
      icon: initialData?.icon ?? null,
      iconSvg: initialData?.iconSvg ?? null,
    }),
    [initialData],
  );

  const form = useForm<TypeFormValues>({ resolver: zodResolver(formSchema), defaultValues });
  const { clearStorage } = useFormPersist({
    form,
    key: `type-form-${storeId}-${initialData?.id ?? "new"}`,
    enabled: !initialData,
  });
  useFormValidationToast({ form });
  const { confirmLeave, confirmationDialog: leaveDialog } = useUnsavedChangesGuard(form, { enabled: !loading });

  const name = form.watch("name");
  const icon = form.watch("icon");
  const iconSvg = form.watch("iconSvg");

  const goToHub = () => {
    router.refresh();
    router.push(hubHref);
  };

  const onSubmit = async (data: TypeFormValues) => {
    const payload = { name: stripLeadingSymbol(data.name), icon: data.icon, iconSvg: data.iconSvg };
    try {
      setLoading(true);
      if (initialData) {
        await axios.patch(`/api/${storeId}/types/${initialData.id}`, payload);
      } else {
        await axios.post(`/api/${storeId}/types`, payload);
      }
      clearStorage();
      form.reset(data);
      goToHub();
      toast({ description: initialData ? "Categoría actualizada" : "Categoría creada", variant: "success" });
    } catch (error) {
      toast({
        title: initialData ? "No se pudo guardar la categoría" : "No se pudo crear la categoría",
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
      await axios.delete(`/api/${storeId}/types/${initialData.id}`);
      goToHub();
      toast({ description: "Categoría eliminada", variant: "success" });
    } catch (error) {
      toast({ title: "No se pudo eliminar la categoría", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const deletion = initialData ? describeTypeDeletion(initialData) : null;
  const storePath = initialData ? `/tienda?typeId=${initialData.slug || initialData.id}` : null;
  const summary = initialData
    ? `${initialData.name} · ${plural(initialData.categoriesCount, "subcategoría", "subcategorías")} · ${plural(initialData.productsCount, "producto", "productos")} · ${storePath}`
    : "Una categoría principal del menú de la tienda. El icono se elige aparte; el nombre no lleva emojis.";

  return (
    <>
      {leaveDialog}
      <FormPageHeader
        title={initialData ? initialData.name : "Nueva categoría"}
        badge={initialData ? <TintBadge label={initialData.isArchived ? "Archivada" : "Activa"} tone={initialData.isArchived ? "slate" : "mint"} /> : null}
        summary={summary}
        backLabel="Volver a Atributos"
        onBack={async () => {
          if (await confirmLeave()) router.push(hubHref);
        }}
      />

      <div className={initialData ? "grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]" : "grid gap-5"}>
        <Form {...form}>
          <form id="type-form" noValidate autoComplete="off" onSubmit={form.handleSubmit(onSubmit)} className="flex min-w-0 flex-col gap-5">
            <SectionCard id="datos" title="Datos" description="Cómo se llama la categoría en el menú de la tienda y en el panel.">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="max-w-[560px]">
                    <FormLabel isRequired>Nombre</FormLabel>
                    <FormControl>
                      <Input disabled={loading} placeholder="Ej. Cuadernos" maxLength={TYPE_NAME_MAX_LENGTH} {...field} />
                    </FormControl>
                    <FormDescription>Sin emojis ni símbolos al inicio: si los escribes, se quitan al guardar y el icono se elige abajo.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </SectionCard>

            <SectionCard id="icono" title="Icono" description="Se ve junto al nombre en el menú, los filtros y las fichas de la tienda.">
              <FormField
                control={form.control}
                name="icon"
                render={() => (
                  <FormItem>
                    <FormControl>
                      <IconPicker
                        value={{ icon: icon ?? null, iconSvg: iconSvg ?? null }}
                        onChange={(next) => {
                          form.setValue("icon", next.icon, { shouldDirty: true, shouldValidate: true });
                          form.setValue("iconSvg", next.iconSvg, { shouldDirty: true, shouldValidate: true });
                        }}
                        name={name}
                        slug={initialData?.slug}
                        storeId={storeId}
                        disabled={loading}
                        aiConfigured={aiIconConfigured}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </SectionCard>

            <FormStickyFooter
              note={initialData ? "Los cambios se ven en la tienda al guardar; la URL de la tienda se conserva como alias si cambia el nombre." : "La categoría queda activa y disponible para subcategorías al crearla."}
            >
              <Button type="submit" form="type-form" isLoading={loading} loadingText={initialData ? "Guardando…" : "Creando…"}>
                {initialData ? "Guardar cambios" : "Crear categoría"}
              </Button>
            </FormStickyFooter>
          </form>
        </Form>

        {initialData && deletion && (
          <div className="flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start">
            <SectionCard id="uso" title="Uso" description="Lo que cuelga de esta categoría hoy.">
              <UsageList
                items={[
                  { label: "Subcategorías activas", value: initialData.activeCategoriesCount },
                  { label: "Subcategorías archivadas", value: initialData.categoriesCount - initialData.activeCategoriesCount },
                  { label: "Productos", value: initialData.productsCount, hint: "En todas sus subcategorías" },
                ]}
              />
              {initialData.categoryPreview.length > 0 && (
                <ul className="flex flex-col gap-1 border-t pt-3 text-sm">
                  {initialData.categoryPreview.map((category) => (
                    <li key={category.id} className="flex items-center justify-between gap-2">
                      <Link href={`/${storeId}/categorias/${category.id}`} className="truncate font-medium text-primary underline-offset-4 hover:underline">
                        {category.name}
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {category.isArchived ? "archivada · " : ""}
                        {plural(category.productsCount, "producto", "productos")}
                      </span>
                    </li>
                  ))}
                  {initialData.categoriesCount > initialData.categoryPreview.length && (
                    <li className="text-xs text-muted-foreground">
                      y {initialData.categoriesCount - initialData.categoryPreview.length} más en{" "}
                      <Link href={`/${storeId}/atributos?tab=subcategorias`} className="font-semibold text-primary underline-offset-4 hover:underline">
                        Subcategorías
                      </Link>
                    </li>
                  )}
                </ul>
              )}
            </SectionCard>

            <AttributeCareCard
              kind="types"
              storeId={storeId}
              entity={initialData}
              noun="la categoría"
              hubHref={`/${storeId}/atributos?tab=categorias${initialData.isArchived ? "" : "&vista=archivados"}`}
              archiveBlockedReason={
                initialData.activeCategoriesCount > 0
                  ? `Tiene ${plural(initialData.activeCategoriesCount, "subcategoría activa", "subcategorías activas")}; archívalas primero.`
                  : null
              }
              canDelete={deletion.canDelete}
              deleteDescription={deletion.description}
              deleteConfirmTitle={`¿Eliminar la categoría «${initialData.name}»?`}
              deleteConfirmDescription={deletion.confirmDescription}
              onDelete={onDelete}
              disabled={loading}
            />
          </div>
        )}
      </div>
    </>
  );
};
