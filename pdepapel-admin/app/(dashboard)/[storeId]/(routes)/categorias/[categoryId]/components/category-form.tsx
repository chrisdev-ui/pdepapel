"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { Category } from "@prisma/client";
import axios from "axios";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AttributeCareCard } from "@/components/ui/attribute-care-card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { FormPageHeader, FormStickyFooter, UsageList } from "@/components/ui/form-page-chrome";
import { ImageUpload } from "@/components/ui/image-upload";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TaxonomyIcon } from "@/components/ui/taxonomy-icon";
import { Textarea } from "@/components/ui/textarea";
import { TintBadge } from "@/components/ui/tint-badge";
import { useFormPersist } from "@/hooks/use-form-persist";
import { useFormValidationToast } from "@/hooks/use-form-validation-toast";
import { useToast } from "@/hooks/use-toast";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { getErrorMessage } from "@/lib/api-errors";
import type { AttributeSibling } from "@/lib/attribute-usage";
import {
  CATEGORY_SEO_DESCRIPTION_MAX,
  CATEGORY_SEO_TITLE_MAX,
  CATEGORY_SEO_TITLE_RECOMMENDED,
} from "@/lib/category-seo";
import { slugify } from "@/lib/slugify";
import { AttributeNameHints } from "../../../atributos/components/attribute-form-hints";
import { formatRelativeDate } from "../../../atributos/components/attribute-cells";
import { AttributeMergeCard } from "../../../atributos/components/merge-card";
import { MergeAttributesDialog } from "../../../atributos/components/merge-dialog";
import { stripLeadingSymbol } from "@/lib/taxonomy-icons";

/** Los topes viven en el módulo neutro: los comparte con el generador de IA. */
export const SEO_TITLE_MAX = CATEGORY_SEO_TITLE_MAX;
export const SEO_DESCRIPTION_MAX = CATEGORY_SEO_DESCRIPTION_MAX;
/** Largo recomendado de la intro; la API acepta hasta 1200 para no romper textos existentes. */
export const SEO_INTRO_RECOMMENDED_MAX = 160;
export const SEO_INTRO_HARD_MAX = 1200;

const formSchema = z
  .object({
    name: z.string().trim().min(1, "Escribe el nombre de la subcategoría").max(80, "Máximo 80 caracteres"),
    typeId: z.string().min(1, "Elige la categoría a la que pertenece"),
    seoEnabled: z.boolean(),
    seoFeatured: z.boolean(),
    seoTitle: z.string().trim().max(SEO_TITLE_MAX, `Máximo ${SEO_TITLE_MAX} caracteres`),
    seoDescription: z.string().trim().max(SEO_DESCRIPTION_MAX, `Máximo ${SEO_DESCRIPTION_MAX} caracteres`),
    seoIntro: z.string().trim().max(SEO_INTRO_HARD_MAX, `Máximo ${SEO_INTRO_HARD_MAX} caracteres`),
    imageUrl: z.string().url("La portada debe ser una URL válida").or(z.literal("")),
  })
  .superRefine((values, context) => {
    if (!values.seoEnabled) return;
    if (!values.seoTitle) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["seoTitle"], message: "Escribe el título SEO para indexar la página" });
    }
    if (!values.seoDescription) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["seoDescription"], message: "Escribe la descripción SEO para indexar la página" });
    }
    if (!values.seoIntro) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["seoIntro"], message: "Escribe la intro para indexar la página" });
    }
    if (values.seoFeatured && !values.imageUrl) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["imageUrl"], message: "Sube una portada para destacarla en inicio" });
    }
  });

type CategoryFormValues = z.infer<typeof formSchema>;

export interface CategoryFormType {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  iconSvg: string | null;
  isArchived: boolean;
}

export interface CategoryUsage {
  activeProducts: number;
  archivedProducts: number;
  groups: number;
  offersCount: number;
}

interface CategoryFormProps {
  initialData: Category | null;
  types: CategoryFormType[];
  usage: CategoryUsage;
  /** Subcategorías activas de la tienda: pistas de parecido y destino de «Unir». */
  siblings?: AttributeSibling[];
  /** `false` cuando el panel no tiene `OPENAI_API_KEY`: los botones de IA se ven deshabilitados. */
  coverConfigured: boolean;
}

interface CoverResponse {
  imageUrl: string | null;
  seoIntro: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  generated: string[];
}

/** Qué se le está pidiendo a la IA ahora mismo; `null` cuando no hay nada en curso. */
type AiTarget = "cover" | "intro" | "seo" | "all";

/**
 * Qué se acaba de rellenar, dicho con las palabras del formulario. El botón
 * de la sección completa no fuerza, así que puede no tocar nada: eso también
 * hay que decirlo, o parece que no funcionó.
 */
const CAMPO_EN_ESPANOL: Record<string, string> = {
  imageUrl: "la portada",
  seoIntro: "la intro",
  seoTitle: "el título",
  seoDescription: "la descripción",
};

function describeGenerated(generated: string[]): string {
  const nombres = generated.map((campo) => CAMPO_EN_ESPANOL[campo]).filter(Boolean);
  if (nombres.length === 0) {
    return "La sección ya estaba completa. Para cambiar algo, usa el botón del campo que quieras rehacer.";
  }
  const lista = nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`;
  return `Se completó ${lista}. Revísalo y guarda si cambias algo más.`;
}

const plural = (count: number, singular: string, pluralForm: string) => `${count} ${count === 1 ? singular : pluralForm}`;

function Counter({ length, max, soft = false }: { length: number; max: number; soft?: boolean }) {
  const over = length > max;
  return (
    <span className={over ? (soft ? "font-semibold text-amber-700" : "font-semibold text-destructive") : "tabular-nums"}>
      {length} / {max}
    </span>
  );
}

export const CategoryForm: React.FC<CategoryFormProps> = ({ initialData, types, usage, coverConfigured, siblings = [] }) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const storeId = String(params.storeId);
  const hubHref = `/${storeId}/atributos?tab=subcategorias${initialData?.isArchived ? "&vista=archivados" : ""}`;

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState<AiTarget | null>(null);

  const defaultValues = useMemo<CategoryFormValues>(
    () => ({
      name: initialData?.name ?? "",
      typeId: initialData?.typeId ?? "",
      seoEnabled: initialData?.seoEnabled ?? false,
      seoFeatured: initialData?.seoFeatured ?? false,
      seoTitle: initialData?.seoTitle ?? "",
      seoDescription: initialData?.seoDescription ?? "",
      seoIntro: initialData?.seoIntro ?? "",
      imageUrl: initialData?.imageUrl ?? "",
    }),
    [initialData],
  );

  const form = useForm<CategoryFormValues>({ resolver: zodResolver(formSchema), defaultValues });
  const { clearStorage } = useFormPersist({
    form,
    key: `category-form-${storeId}-${initialData?.id ?? "new"}`,
    enabled: !initialData,
  });
  useFormValidationToast({ form });
  const { confirmLeave, confirmationDialog: leaveDialog } = useUnsavedChangesGuard(form, { enabled: !loading });

  const name = form.watch("name");
  const typeId = form.watch("typeId");
  const seoEnabled = form.watch("seoEnabled");
  const seoTitle = form.watch("seoTitle");
  const seoDescription = form.watch("seoDescription");
  const seoIntro = form.watch("seoIntro");
  const imageUrl = form.watch("imageUrl");

  const selectedType = types.find((type) => type.id === typeId) ?? null;
  // La URL sale del nombre (la API la regenera al renombrar y conserva la anterior como alias).
  const effectiveSlug = initialData && stripLeadingSymbol(name) === initialData.name ? initialData.slug : slugify(stripLeadingSymbol(name)) || initialData?.slug || "…";
  const storePath = `/categoria/${effectiveSlug}`;
  const productsTotal = usage.activeProducts + usage.archivedProducts;
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);

  const goToHub = () => {
    router.push(hubHref);
    router.refresh();
  };

  const onSubmit = async (data: CategoryFormValues) => {
    const payload = {
      ...data,
      name: stripLeadingSymbol(data.name),
      seoFeatured: data.seoEnabled && data.seoFeatured,
    };
    try {
      setLoading(true);
      if (initialData) {
        await axios.patch(`/api/${storeId}/categories/${initialData.id}`, payload);
      } else {
        await axios.post(`/api/${storeId}/categories`, payload);
      }
      clearStorage();
      form.reset(data);
      goToHub();
      toast({ description: initialData ? "Subcategoría actualizada" : "Subcategoría creada", variant: "success" });
    } catch (error) {
      toast({
        title: initialData ? "No se pudo guardar la subcategoría" : "No se pudo crear la subcategoría",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  /**
   * La API de portadas genera la parte pedida (`part`) y la guarda en la
   * categoría; el formulario recibe el resultado para revisarlo.
   */
  /**
   * `force` en `false` solo rellena lo que esté vacío: es lo que hace el botón
   * de la sección completa, para no volver a pagar una imagen que ya está.
   * Los botones de cada campo sí fuerzan, porque ahí lo que se pide es otra
   * propuesta distinta de la que ya se ve.
   */
  const generate = async (target: AiTarget, force = true) => {
    if (!initialData) return;
    try {
      setGenerating(target);
      const { data } = await axios.post<CoverResponse>(`/api/${storeId}/categories/${initialData.id}/cover`, { part: target, force });
      if (target === "cover" && data.imageUrl) {
        form.setValue("imageUrl", data.imageUrl, { shouldDirty: true, shouldValidate: true });
      }
      if (target === "intro" && data.seoIntro) {
        form.setValue("seoIntro", data.seoIntro, { shouldDirty: true, shouldValidate: true });
      }
      if (target === "seo" || target === "all") {
        if (data.seoTitle) form.setValue("seoTitle", data.seoTitle, { shouldDirty: true, shouldValidate: true });
        if (data.seoDescription) {
          form.setValue("seoDescription", data.seoDescription, { shouldDirty: true, shouldValidate: true });
        }
      }
      if (target === "all") {
        if (data.imageUrl) form.setValue("imageUrl", data.imageUrl, { shouldDirty: true, shouldValidate: true });
        if (data.seoIntro) form.setValue("seoIntro", data.seoIntro, { shouldDirty: true, shouldValidate: true });
      }
      const aviso = {
        cover: "Portada generada. Quedó guardada en la categoría; revísala y guarda si cambias algo más.",
        intro: "Intro propuesta. Edítala antes de guardar; ya quedó registrada en la categoría.",
        seo: "Título y descripción propuestos. Edítalos antes de guardar; ya quedaron registrados en la categoría.",
        all: describeGenerated(data.generated),
      } as const;
      toast({ description: aviso[target], variant: "success" });
    } catch (error) {
      toast({ title: "No se pudo generar con IA", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setGenerating(null);
    }
  };

  const onDelete = async () => {
    if (!initialData) return;
    try {
      setLoading(true);
      await axios.delete(`/api/${storeId}/categories/${initialData.id}`);
      goToHub();
      toast({ description: "Subcategoría eliminada", variant: "success" });
    } catch (error) {
      toast({ title: "No se pudo eliminar la subcategoría", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const aiHint = !initialData
    ? "Guarda la subcategoría para generar con IA."
    : !coverConfigured
      ? "La generación con IA no está configurada."
      : null;
  const canDelete = Boolean(initialData) && productsTotal === 0;
  const summary = initialData
    ? `${initialData.name} · en ${selectedType?.name ?? "—"} · ${plural(productsTotal, "producto", "productos")} · ${storePath}`
    : "Pertenece a una categoría y tiene su propia URL en la tienda. La URL sale del nombre; después se puede cambiar sin perder la anterior.";

  return (
    <>
      {leaveDialog}
      {mergeTarget && initialData && (
        <MergeAttributesDialog
          storeId={storeId}
          kind="categories"
          selectedIds={[initialData.id]}
          candidates={siblings}
          initialTargetId={mergeTarget}
          open
          onOpenChange={(next) => !next && setMergeTarget(null)}
          onDone={() => {
            setMergeTarget(null);
            goToHub();
          }}
        />
      )}
      <FormPageHeader
        title={initialData ? initialData.name : "Nueva subcategoría"}
        badge={initialData ? <TintBadge label={initialData.isArchived ? "Archivada" : "Activa"} tone={initialData.isArchived ? "slate" : "mint"} /> : null}
        summary={summary}
        backLabel="Volver a Atributos"
        onBack={async () => {
          if (await confirmLeave()) router.push(hubHref);
        }}
      />

      <div className={initialData ? "grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]" : "grid gap-5"}>
        <Form {...form}>
          <form id="category-form" noValidate autoComplete="off" onSubmit={form.handleSubmit(onSubmit)} className="flex min-w-0 flex-col gap-5">
            <SectionCard id="datos" title="Datos" description="Nombre, categoría a la que pertenece y URL pública.">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>Nombre</FormLabel>
                      <FormControl>
                        <Input disabled={loading} placeholder="Ej. Accesorios de escritorio" maxLength={80} {...field} />
                      </FormControl>
                      <FormMessage />
                      <AttributeNameHints
                        name={stripLeadingSymbol(name)}
                        siblings={siblings}
                        currentId={initialData?.id}
                        entity="category"
                        hrefFor={(id) => `/${storeId}/categorias/${id}`}
                        onMerge={initialData && !initialData.isArchived ? (targetId) => setMergeTarget(targetId) : undefined}
                      />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="typeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>Categoría</FormLabel>
                      <Select disabled={loading} onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger aria-label="Categoría">
                            <SelectValue placeholder="Elige la categoría" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {types.map((type) => (
                            <SelectItem key={type.id} value={type.id}>
                              <span className="flex items-center gap-2">
                                <TaxonomyIcon icon={type.icon} iconSvg={type.iconSvg} name={type.name} slug={type.slug} className="h-4 w-4 text-muted-foreground" />
                                <span>{type.name}</span>
                                {type.isArchived && <span className="text-xs text-muted-foreground">(archivada)</span>}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-medium text-primary">URL en la tienda</p>
                <code className="w-fit rounded bg-muted px-2 py-1 text-sm text-primary" data-testid="category-store-path">
                  {storePath}
                </code>
                <p className="text-xs text-muted-foreground">
                  Sale del nombre. Si renombras, la URL cambia y la anterior sigue redirigiendo (alias), así que los enlaces antiguos no se rompen.
                </p>
              </div>
            </SectionCard>

            <SectionCard
              id="pagina-y-seo"
              title="Página en la tienda y SEO"
              description={seoEnabled ? "La página se indexa en buscadores: título, descripción e intro son obligatorios." : "Activa la indexación solo con contenido propio y stock estable."}
              action={
                <div className="flex flex-wrap items-center gap-3">
                  {/*
                    Un solo botón para toda la sección: portada, intro, título
                    y descripción en una sola petición. No fuerza, así que
                    completa lo que falte y deja en paz lo que ya está —volver
                    a generar la portada cuesta una imagen—. Para rehacer algo
                    en concreto está el botón de su campo.
                  */}
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={loading || Boolean(aiHint) || generating !== null}
                    isLoading={generating === "all"}
                    loadingText="Generando…"
                    onClick={() => void generate("all", false)}
                    title={aiHint ?? "Completa con IA lo que falte de esta sección."}
                  >
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    Completar sección con IA
                  </Button>
                  <FormField
                    control={form.control}
                    name="seoEnabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormLabel className="text-xs font-semibold">Indexar</FormLabel>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} disabled={loading} aria-label="Indexar la página de la subcategoría" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              }
            >
              <FormField
                control={form.control}
                name="imageUrl"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <FormLabel isRequired={seoEnabled && form.watch("seoFeatured")}>Portada</FormLabel>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        disabled={loading || Boolean(aiHint) || generating !== null}
                        isLoading={generating === "cover"}
                        loadingText="Generando…"
                        onClick={() => void generate("cover")}
                        title={aiHint ?? "Propone otra portada, aunque ya haya una."}
                      >
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                        Generar
                      </Button>
                    </div>
                    <FormControl>
                      <ImageUpload
                        value={field.value ? [{ url: field.value, isMain: true }] : []}
                        disabled={loading}
                        onChange={(images) => field.onChange(images.length > 0 ? images[0].url : "")}
                        onRemove={() => field.onChange("")}
                      />
                    </FormControl>
                    <FormDescription>
                      Cuadrada, sin texto y representativa. {aiHint ?? "La IA la genera en el estilo pastel de las demás portadas y la guarda al momento."}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="seoFeatured"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Destacar en inicio</FormLabel>
                      <FormDescription>Aparece en la navegación principal de la tienda. Necesita portada e indexación.</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} disabled={loading || !seoEnabled} aria-label="Destacar en inicio" />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/*
                El par se genera de una sola vez: el título y la descripción
                son lo que se ve en Google uno encima del otro y se escriben
                mirándose. Además son los dos campos menos evidentes del
                formulario —cuánto miden, que la tienda ya añade la marca
                detrás del título— y ahí es donde una propuesta ayuda más.
              */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-sans text-sm font-medium text-muted-foreground">
                  Lo que se ve en Google
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={loading || Boolean(aiHint) || generating !== null}
                  isLoading={generating === "seo"}
                  loadingText="Generando…"
                  onClick={() => void generate("seo")}
                  title={aiHint ?? "Propone otro título y otra descripción, aunque ya haya."}
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Generar
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="seoTitle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired={seoEnabled}>Título SEO</FormLabel>
                      <FormControl>
                        <Input disabled={loading} placeholder="Ej. Agendas kawaii en Colombia" maxLength={SEO_TITLE_MAX} {...field} />
                      </FormControl>
                      <FormDescription>
                        <Counter length={seoTitle.length} max={SEO_TITLE_MAX} />
                        {" · "}
                        La tienda le añade «| Papelería P de Papel», así que va mejor cerca de {CATEGORY_SEO_TITLE_RECOMMENDED} caracteres y sin repetir la marca.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="seoDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired={seoEnabled}>Descripción SEO</FormLabel>
                      <FormControl>
                        <Textarea disabled={loading} placeholder="Qué encontrará la persona y por qué comprarlo aquí." maxLength={SEO_DESCRIPTION_MAX} className="min-h-[80px]" {...field} />
                      </FormControl>
                      <FormDescription>
                        <Counter length={seoDescription.length} max={SEO_DESCRIPTION_MAX} />
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="seoIntro"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <FormLabel isRequired={seoEnabled}>Intro (110–160 caracteres)</FormLabel>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        disabled={loading || Boolean(aiHint) || generating !== null}
                        isLoading={generating === "intro"}
                        loadingText="Generando…"
                        onClick={() => void generate("intro")}
                        title={aiHint ?? "Propone otra intro, aunque ya haya una."}
                      >
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                        Generar
                      </Button>
                    </div>
                    <FormControl>
                      <Textarea disabled={loading} placeholder="Una o dos frases sobre para qué sirven estos productos o a quién le gustan." maxLength={SEO_INTRO_HARD_MAX} className="min-h-[96px]" {...field} />
                    </FormControl>
                    <FormDescription>
                      <Counter length={seoIntro.length} max={SEO_INTRO_RECOMMENDED_MAX} soft /> · Español de Colombia, sin nombre de marca. La propuesta se edita antes de guardar.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </SectionCard>

            <FormStickyFooter note={initialData ? "Al guardar se actualiza la tienda; si cambia la URL, la anterior queda como alias." : "La subcategoría queda activa al crearla."}>
              <Button type="submit" form="category-form" isLoading={loading} loadingText={initialData ? "Guardando…" : "Creando…"}>
                {initialData ? "Guardar cambios" : "Crear subcategoría"}
              </Button>
            </FormStickyFooter>
          </form>
        </Form>

        {initialData && (
          <div className="flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start">
            <SectionCard id="uso" title="Uso" description="Lo que depende de esta subcategoría hoy.">
              <UsageList
                items={[
                  { label: "Productos activos", value: usage.activeProducts },
                  { label: "Productos archivados", value: usage.archivedProducts },
                  { label: "Grupos con variantes", value: usage.groups },
                  { label: "Ofertas que la usan", value: usage.offersCount },
                  { label: "Último cambio", value: formatRelativeDate(initialData.updatedAt) },
                ]}
              />
              {productsTotal > 0 && (
                <Button asChild variant="outline" size="sm" className="w-fit">
                  <Link href={`/${storeId}/productos?subcategoria=${initialData.id}`}>Ver sus productos</Link>
                </Button>
              )}
              {imageUrl && (
                <p className="text-xs text-muted-foreground">
                  Portada actual:{" "}
                  <a href={imageUrl} target="_blank" rel="noreferrer" className="font-semibold text-primary underline-offset-4 hover:underline">
                    abrir
                  </a>
                </p>
              )}
            </SectionCard>

            <AttributeCareCard
              kind="categories"
              storeId={storeId}
              entity={initialData}
              noun="la subcategoría"
              hubHref={`/${storeId}/atributos?tab=subcategorias${initialData.isArchived ? "" : "&vista=archivados"}`}
              archiveBlockedReason={
                usage.activeProducts > 0
                  ? `Todavía hay ${plural(usage.activeProducts, "producto activo", "productos activos")}; muévelos a otra subcategoría o archívalos antes.`
                  : null
              }
              canDelete={canDelete}
              deleteDescription={
                canDelete
                  ? "No tiene productos: se puede eliminar de inmediato. Su URL deja de existir y no se puede deshacer."
                  : `No se puede eliminar: ${plural(productsTotal, "producto la usa", "productos la usan")} (incluidos los archivados). Archívala para que deje de ofrecerse.`
              }
              deleteConfirmTitle={`¿Eliminar la subcategoría «${initialData.name}»?`}
              deleteConfirmDescription="Se elimina de inmediato, junto con sus alias de URL y sus opciones para clientes. Esta acción no se puede deshacer."
              onDelete={onDelete}
              disabled={loading}
            />
            <AttributeMergeCard
              storeId={storeId}
              kind="categories"
              entity={initialData}
              candidates={siblings}
              hubHref={hubHref}
              description="Pasa sus productos y ofertas a otra subcategoría y deja esta archivada; su URL queda como alias de la otra."
              disabled={loading}
            />
          </div>
        )}
      </div>
    </>
  );
};
