"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { Check, Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useCanWrite } from "@/components/shell/viewer-access";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { FormPageHeader, FormStickyFooter } from "@/components/ui/form-page-chrome";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { TintBadge } from "@/components/ui/tint-badge";
import { useFormValidationToast } from "@/hooks/use-form-validation-toast";
import { useToast } from "@/hooks/use-toast";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { getErrorMessage } from "@/lib/api-errors";
import { brandsApi, plural } from "@/lib/brand-admin";
import {
  BRAND_LOGO_MIN_WIDTH,
  BRAND_LOGO_PERMISSION_LABELS,
  BRAND_NAME_MAX_LENGTH,
  BRAND_SEO_TEXT_MAX_LENGTH,
  checkBrandColor,
  formatContrastRatio,
  isBrandColor,
  type BrandLogoPermissionValue,
} from "@/lib/brand-rules";
import { slugify } from "@/lib/slugify";

import { BrandLogoTile } from "../../components/brand-logo-tile";
import type { BrandDetail, BrandParentOption } from "../server/get-brand";
import { AliasInput } from "./alias-input";
import { BrandLogoUpload, detectLogoBackground, LogoPreview, type UploadedLogo } from "./brand-logo-upload";
import { BrandStorePreview } from "./brand-store-preview";
import { ChangeSlugDialog } from "./change-slug-dialog";

const PERMISSIONS = Object.keys(BRAND_LOGO_PERMISSION_LABELS) as BrandLogoPermissionValue[];

/** «Ninguna (marca principal)»: el Combobox no tiene opción vacía propia. */
const NO_PARENT = "__principal__";

const urlField = z
  .string()
  .trim()
  .max(500, "Máximo 500 caracteres")
  .refine((value) => value === "" || /^https?:\/\//i.test(value), "Debe ser una dirección web (https://…)");

const formSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(BRAND_NAME_MAX_LENGTH, `Máximo ${BRAND_NAME_MAX_LENGTH} caracteres`),
  aliases: z.array(z.string()),
  manufacturerName: z.string().trim().max(120, "Máximo 120 caracteres"),
  logoUrl: z.string().nullable(),
  logoPublicId: z.string().nullable(),
  logoWidth: z.number().nullable(),
  logoHeight: z.number().nullable(),
  logoHasBackground: z.boolean(),
  logoInverseUrl: z.string().nullable(),
  color: z
    .string()
    .trim()
    .refine((value) => value === "" || isBrandColor(value), "El color va como #RRGGBB")
    .refine((value) => !isBrandColor(value) || checkBrandColor(value).ok, "Muy oscuro: el texto no se leería"),
  seoText: z.string().trim().max(BRAND_SEO_TEXT_MAX_LENGTH, `Máximo ${BRAND_SEO_TEXT_MAX_LENGTH} caracteres`),
  website: urlField,
  logoSourceUrl: urlField,
  logoPermission: z.enum(["UNKNOWN", "ALLOWED", "PENDING", "DENIED"]),
  isVisible: z.boolean(),
  isFeatured: z.boolean(),
  parentBrandId: z.string().nullable(),
});

type BrandFormValues = z.infer<typeof formSchema>;

const nullIfEmpty = (value: string) => (value.trim() ? value.trim() : null);

function toPayload(values: BrandFormValues) {
  return {
    ...values,
    manufacturerName: nullIfEmpty(values.manufacturerName),
    color: values.color ? values.color.toUpperCase() : null,
    seoText: nullIfEmpty(values.seoText),
    website: nullIfEmpty(values.website),
    logoSourceUrl: nullIfEmpty(values.logoSourceUrl),
  };
}

function defaultsFrom(brand: BrandDetail | null): BrandFormValues {
  return {
    name: brand?.name ?? "",
    aliases: brand?.aliases ?? [],
    manufacturerName: brand?.manufacturerName ?? "",
    logoUrl: brand?.logoUrl ?? null,
    logoPublicId: brand?.logoPublicId ?? null,
    logoWidth: brand?.logoWidth ?? null,
    logoHeight: brand?.logoHeight ?? null,
    logoHasBackground: brand?.logoHasBackground ?? false,
    logoInverseUrl: brand?.logoInverseUrl ?? null,
    color: brand?.color ?? "",
    seoText: brand?.seoText ?? "",
    website: brand?.website ?? "",
    logoSourceUrl: brand?.logoSourceUrl ?? "",
    logoPermission: brand?.logoPermission ?? "UNKNOWN",
    isVisible: brand?.isVisible ?? true,
    isFeatured: brand?.isFeatured ?? false,
    parentBrandId: brand?.parentBrandId ?? null,
  };
}

interface BrandFormProps {
  initialData: BrandDetail | null;
  /** Candidatas a «Es una línea de» (principales sin archivar, sin ella misma). */
  parentOptions: BrandParentOption[];
  storeUrl: string | null;
}

type BackgroundCheck = "idle" | "checking" | "failed";

export function BrandForm({ initialData, parentOptions, storeUrl }: BrandFormProps) {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const canWrite = useCanWrite();
  const storeId = String(params.storeId);
  const listHref = `/${storeId}/marcas`;

  const [loading, setLoading] = useState(false);
  const [slug, setSlug] = useState(initialData?.slug ?? "");
  const [slugOpen, setSlugOpen] = useState(false);
  const [backgroundCheck, setBackgroundCheck] = useState<BackgroundCheck>("idle");
  /** Archivos subidos en esta visita y todavía sin guardar: se borran si se descartan. */
  const unsavedUploads = useRef(new Set<string>());

  const defaultValues = useMemo(() => defaultsFrom(initialData), [initialData]);
  const form = useForm<BrandFormValues>({ resolver: zodResolver(formSchema), defaultValues });
  useFormValidationToast({ form });
  const { isDirty, confirmLeave, confirmationDialog } = useUnsavedChangesGuard(form, { enabled: !loading });

  const values = form.watch();
  const colorCheck = isBrandColor(values.color) ? checkBrandColor(values.color) : null;
  const colorBlocked = values.color !== "" && (!colorCheck || !colorCheck.ok);

  const cleanup = async (urls: string[]) => {
    await Promise.allSettled(urls.map((imageUrl) => axios.post(`/api/${storeId}/cloudinary`, { imageUrl })));
    urls.forEach((url) => unsavedUploads.current.delete(url));
  };

  const dropIfUnsaved = (url: string | null) => {
    if (url && unsavedUploads.current.has(url)) void cleanup([url]);
  };

  const onLogoUploaded = async (logo: UploadedLogo) => {
    dropIfUnsaved(form.getValues("logoUrl"));
    unsavedUploads.current.add(logo.url);
    const dirty = { shouldDirty: true };
    form.setValue("logoUrl", logo.url, dirty);
    form.setValue("logoPublicId", logo.publicId, dirty);
    form.setValue("logoWidth", logo.width, dirty);
    form.setValue("logoHeight", logo.height, dirty);
    form.setValue("logoHasBackground", false, dirty);
    setBackgroundCheck("checking");
    const hasBackground = await detectLogoBackground(logo.url);
    if (form.getValues("logoUrl") !== logo.url) return;
    form.setValue("logoHasBackground", hasBackground === true, dirty);
    setBackgroundCheck(hasBackground === null ? "failed" : "idle");
  };

  const onLogoRemoved = () => {
    dropIfUnsaved(form.getValues("logoUrl"));
    const dirty = { shouldDirty: true };
    form.setValue("logoUrl", null, dirty);
    form.setValue("logoPublicId", null, dirty);
    form.setValue("logoWidth", null, dirty);
    form.setValue("logoHeight", null, dirty);
    form.setValue("logoHasBackground", false, dirty);
    setBackgroundCheck("idle");
  };

  const onInverseUploaded = (logo: UploadedLogo) => {
    dropIfUnsaved(form.getValues("logoInverseUrl"));
    unsavedUploads.current.add(logo.url);
    form.setValue("logoInverseUrl", logo.url, { shouldDirty: true });
  };

  const onInverseRemoved = () => {
    dropIfUnsaved(form.getValues("logoInverseUrl"));
    form.setValue("logoInverseUrl", null, { shouldDirty: true });
  };

  const onDiscard = async () => {
    await cleanup(Array.from(unsavedUploads.current));
    form.reset(defaultValues);
    setBackgroundCheck("idle");
  };

  const onBack = async () => {
    if (!(await confirmLeave())) return;
    void cleanup(Array.from(unsavedUploads.current));
    router.push(listHref);
  };

  const onSubmit = async (data: BrandFormValues) => {
    try {
      setLoading(true);
      const payload = toPayload(data);
      const response = initialData
        ? await axios.patch(`${brandsApi(storeId)}/${initialData.id}`, payload)
        : await axios.post(`${brandsApi(storeId)}`, payload);
      // Lo subido y luego reemplazado antes de guardar ya no lo usa nadie.
      const kept = new Set([data.logoUrl, data.logoInverseUrl]);
      await cleanup(Array.from(unsavedUploads.current).filter((url) => !kept.has(url)));
      unsavedUploads.current.clear();
      form.reset(data);
      toast({ description: initialData ? "Marca guardada." : "Marca creada.", variant: "success" });
      if (!initialData) router.push(`/${storeId}/marcas/${response.data.id}`);
      router.refresh();
    } catch (error) {
      toast({
        title: initialData ? "No se pudo guardar la marca" : "No se pudo crear la marca",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const usage = initialData?.usage;
  const summary = initialData
    ? [
        `/marcas/${slug}`,
        `${plural(usage?.activeProducts ?? 0, "producto activo", "productos activos")} (${usage?.totalProducts ?? 0} en total)`,
        initialData.manufacturerName,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Una marca con su logo original, su página en la tienda y su lugar en el filtro «Marca».";
  const storeLink = storeUrl && initialData ? `${storeUrl.replace(/\/$/, "")}/marcas/${slug}` : null;
  const disabled = loading || !canWrite;
  const width = values.logoWidth;
  const hasLines = (initialData?.activeLines ?? 0) > 0;
  const parentName = parentOptions.find((option) => option.id === values.parentBrandId)?.name ?? null;

  return (
    <>
      {confirmationDialog}
      {initialData && (
        <ChangeSlugDialog
          key={slug}
          storeId={storeId}
          brandId={initialData.id}
          slug={slug}
          open={slugOpen}
          onOpenChange={setSlugOpen}
          // La dirección vive en `slug`: refrescar remontaba el formulario y borraba lo escrito sin guardar.
          onChanged={(next) => setSlug(next)}
        />
      )}
      <FormPageHeader
        title={initialData ? initialData.name : "Nueva marca"}
        badge={
          initialData ? (
            <span className="flex flex-wrap gap-1.5">
              {initialData.isArchived ? (
                <TintBadge label="Archivada" tone="slate" />
              ) : (
                <TintBadge label={initialData.isVisible ? "Visible" : "Oculta"} tone={initialData.isVisible ? "mint" : "slate"} />
              )}
              {initialData.isFeatured && !initialData.isArchived && <TintBadge label="En Compra por marca" tone="lavender" />}
            </span>
          ) : null
        }
        summary={summary}
        backLabel="Volver a Marcas"
        onBack={() => void onBack()}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Form {...form}>
          <form id="brand-form" noValidate autoComplete="off" onSubmit={form.handleSubmit(onSubmit)} className="flex min-w-0 flex-col gap-5">
            <fieldset disabled={!canWrite} className="contents">
              <SectionCard id="datos" title="Datos de la marca" description="El nombre tal como lo escribe la marca.">
                <div className="grid gap-5 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel isRequired>Nombre</FormLabel>
                        <FormControl>
                          <Input disabled={disabled} placeholder="Ej. Kiut" maxLength={BRAND_NAME_MAX_LENGTH} className="min-h-11" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium text-primary">Dirección de su página</span>
                    {initialData ? (
                      <>
                        <div className="flex min-h-11 flex-wrap items-center gap-2">
                          {storeLink ? (
                            <a href={storeLink} target="_blank" rel="noreferrer" className="text-sm text-primary underline-offset-4 hover:underline">
                              /marcas/{slug}
                              <span className="sr-only"> (abre la tienda en otra pestaña)</span>
                            </a>
                          ) : (
                            <span className="text-sm text-primary">/marcas/{slug}</span>
                          )}
                          <TintBadge label="Fija" tone="lavender" />
                          {canWrite && (
                            <Button
                              variant="link"
                              className="min-h-11 px-1 text-primary underline"
                              disabled={loading}
                              onClick={() => setSlugOpen(true)}
                            >
                              Cambiar dirección
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          No cambia si renombras la marca. Si la cambias, la dirección anterior redirige a la nueva.
                        </p>
                      </>
                    ) : (
                      <p className="flex min-h-11 items-center text-sm text-muted-foreground">
                        Se crea con el nombre: /marcas/{slugify(values.name) || "…"}
                      </p>
                    )}
                  </div>
                  <FormField
                    control={form.control}
                    name="manufacturerName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fabricante</FormLabel>
                        <FormControl>
                          <Input disabled={disabled} placeholder="Ej. Carvajal Educación" maxLength={120} className="min-h-11" {...field} />
                        </FormControl>
                        <FormDescription>Quién la fabrica. Solo para ti.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="aliases"
                    render={({ field }) => (
                      <FormItem>
                        <span className="text-sm font-medium text-primary">Alias</span>
                        <AliasInput
                          value={field.value}
                          onChange={field.onChange}
                          brandName={values.name}
                          disabled={disabled}
                          describedBy="alias-ayuda"
                        />
                        <p id="alias-ayuda" className="text-xs text-muted-foreground">
                          Otras formas de escribirla. Si el nombre de un producto dice un alias, te sugerimos esta marca.
                        </p>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="parentBrandId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Es una línea de</FormLabel>
                        <FormControl>
                          <Combobox
                            options={[
                              { value: NO_PARENT, label: "Ninguna (marca principal)" },
                              ...parentOptions.map((option) => ({
                                value: option.id,
                                label: option.isArchived ? `${option.name} · archivada` : option.name,
                                keywords: option.aliases,
                                icon: <BrandLogoTile logoUrl={option.logoUrl} size="sm" className="h-8 w-8 p-0.5 text-[8px]" />,
                              })),
                            ]}
                            value={field.value ?? NO_PARENT}
                            onChange={(next) => field.onChange(next && next !== NO_PARENT ? next : null)}
                            disabled={disabled || hasLines}
                            searchPlaceholder="Buscar marca…"
                            emptyText="No hay otra marca principal."
                            className="min-h-11 w-full"
                          />
                        </FormControl>
                        <FormDescription>
                          {hasLines
                            ? "Tiene líneas: no puede ser a su vez una línea de otra marca."
                            : `Una línea se ve como una marca propia (su página, su logo, su filtro) y en la ficha sale «Marca: ${parentName ?? "la marca madre"} · Línea: ${values.name.trim() || "esta marca"}».`}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </SectionCard>

              <SectionCard
                id="logo"
                title="Logo oficial"
                description="PNG o SVG con fondo transparente, de al menos 400 px de ancho. Súbelo tal cual lo entrega la marca: sin recortarlo ni cambiarle colores."
              >
                <div className="grid gap-4 sm:grid-cols-3">
                  <BrandLogoUpload
                    value={values.logoUrl}
                    disabled={disabled}
                    label={values.logoUrl ? "Cambiar logo" : "Subir logo"}
                    removeLabel="Quitar logo"
                    onUploaded={(logo) => void onLogoUploaded(logo)}
                    onRemove={onLogoRemoved}
                  />
                  {values.logoUrl ? (
                    <>
                      <LogoPreview url={values.logoUrl} caption="Sobre fondo claro" />
                      <LogoPreview url={values.logoInverseUrl ?? values.logoUrl} dark caption="Sobre fondo oscuro" />
                    </>
                  ) : (
                    <p className="flex items-center rounded-xl border border-dashed p-4 text-sm text-muted-foreground sm:col-span-2">
                      Sin logo, la tienda muestra el nombre de la marca en una píldora.
                    </p>
                  )}
                </div>

                {values.logoUrl && (
                  <ul className="flex flex-col gap-2 text-sm" aria-live="polite">
                    {width === null ? (
                      <li className="text-muted-foreground">Resolución: el archivo no dice su tamaño (pasa con algunos SVG, que se ven nítidos a cualquier tamaño).</li>
                    ) : width >= BRAND_LOGO_MIN_WIDTH ? (
                      <li className="flex items-start gap-2 text-emerald-800">
                        <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>
                          <strong>Resolución bien:</strong> {width} × {values.logoHeight ?? "?"} px (mínimo {BRAND_LOGO_MIN_WIDTH} px de ancho).
                        </span>
                      </li>
                    ) : (
                      <li className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
                        <strong>! Resolución baja: se verá borroso en el celular.</strong> {width} × {values.logoHeight ?? "?"} px; pide uno de al
                        menos {BRAND_LOGO_MIN_WIDTH} px de ancho.
                      </li>
                    )}
                    {backgroundCheck === "checking" ? (
                      <li className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Revisando si el fondo es transparente…
                      </li>
                    ) : values.logoHasBackground ? (
                      <li className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
                        <strong>! El fondo no es transparente.</strong> En la tienda se verá como una ficha. Si la marca tiene el logo sin fondo,
                        súbelo en su lugar.
                      </li>
                    ) : backgroundCheck === "failed" ? (
                      <li className="text-muted-foreground">No se pudo revisar el fondo del archivo. Míralo en las vistas de arriba.</li>
                    ) : (
                      <li className="flex items-start gap-2 text-emerald-800">
                        <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>
                          <strong>Fondo transparente.</strong>
                        </span>
                      </li>
                    )}
                  </ul>
                )}

                {values.logoUrl && (
                  <div className="flex flex-col gap-2 rounded-xl border p-3">
                    <p className="text-sm font-medium text-primary">Logo para fondo oscuro (opcional)</p>
                    <p className="text-xs text-muted-foreground">Si la marca tiene una versión en blanco o clara, súbela aquí.</p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <BrandLogoUpload
                        value={values.logoInverseUrl}
                        disabled={disabled}
                        label={values.logoInverseUrl ? "Cambiar logo claro" : "Subir logo claro"}
                        removeLabel="Quitar logo claro"
                        onUploaded={onInverseUploaded}
                        onRemove={onInverseRemoved}
                      />
                    </div>
                  </div>
                )}

                <div className="grid gap-5 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="logoPermission"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Permiso de uso del logo</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                          <FormControl>
                            <SelectTrigger className="min-h-11">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {PERMISSIONS.map((permission) => (
                              <SelectItem key={permission} value={permission}>
                                {BRAND_LOGO_PERMISSION_LABELS[permission]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>Con «Pendiente» o «Negado», la tienda muestra el nombre en vez del logo.</FormDescription>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="logoSourceUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fuente del logo</FormLabel>
                        <FormControl>
                          <Input disabled={disabled} type="url" inputMode="url" placeholder="https://…" className="min-h-11" {...field} />
                        </FormControl>
                        <FormDescription>De dónde sacaste el logo, para pedirlo de nuevo si cambia.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sitio oficial</FormLabel>
                        <FormControl>
                          <Input disabled={disabled} type="url" inputMode="url" placeholder="https://…" className="min-h-11" {...field} />
                        </FormControl>
                        <FormDescription>La página de la marca. Solo para ti.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </SectionCard>

              <SectionCard id="tienda" title="En la tienda" description="Dónde sale y qué dice su página.">
                <FormField
                  control={form.control}
                  name="isVisible"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between gap-4 space-y-0">
                      <div className="flex flex-col gap-0.5">
                        <FormLabel>Visible en la tienda</FormLabel>
                        <FormDescription>Oculta: su página no existe y no sale en el filtro.</FormDescription>
                      </div>
                      <span className="flex min-h-11 items-center">
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} disabled={disabled} />
                        </FormControl>
                      </span>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isFeatured"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between gap-4 space-y-0">
                      <div className="flex flex-col gap-0.5">
                        <FormLabel>Mostrar en «Compra por marca»</FormLabel>
                        <FormDescription>El carrusel de logos del inicio (fase 2) y el menú.</FormDescription>
                      </div>
                      <span className="flex min-h-11 items-center">
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} disabled={disabled} />
                        </FormControl>
                      </span>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Color de la marca (opcional)</FormLabel>
                      <div className="flex flex-wrap items-center gap-3">
                        <input
                          type="color"
                          aria-label="Elegir el color en la paleta"
                          disabled={disabled}
                          value={isBrandColor(field.value) ? field.value.toLowerCase() : "#fde2ec"}
                          onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                          className="h-11 w-14 cursor-pointer rounded-md border bg-white p-1"
                        />
                        <FormControl>
                          <Input
                            disabled={disabled}
                            placeholder="#FDE2EC"
                            maxLength={7}
                            className="min-h-11 w-32 font-mono uppercase"
                            {...field}
                          />
                        </FormControl>
                        {field.value && canWrite && (
                          <Button variant="ghost" className="min-h-11" disabled={disabled} onClick={() => field.onChange("")}>
                            Quitar color
                          </Button>
                        )}
                        <p className="text-sm" aria-live="polite">
                          {field.value === "" ? (
                            <span className="text-muted-foreground">Sin color: el encabezado usa el rosado de la tienda.</span>
                          ) : !colorCheck ? (
                            <span className="font-semibold text-amber-900">! El color va como #RRGGBB</span>
                          ) : colorCheck.ok ? (
                            <span className="font-semibold text-emerald-800">
                              ✓ Contraste bien: el texto se lee ({formatContrastRatio(colorCheck.ratio)})
                            </span>
                          ) : (
                            <span className="font-semibold text-red-700">
                              ! Muy oscuro: el texto no se leería ({formatContrastRatio(colorCheck.ratio)})
                            </span>
                          )}
                        </p>
                      </div>
                      <FormDescription>Tiñe el encabezado de su página. Un color muy oscuro no se puede guardar.</FormDescription>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="seoText"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Texto corto para Google y su página</FormLabel>
                      <FormControl>
                        <Textarea
                          disabled={disabled}
                          rows={3}
                          maxLength={BRAND_SEO_TEXT_MAX_LENGTH}
                          placeholder="Qué vendes de esta marca, en una o dos frases."
                          {...field}
                        />
                      </FormControl>
                      <p className="text-right text-xs tabular-nums text-muted-foreground" aria-live="polite">
                        {field.value.length} / {BRAND_SEO_TEXT_MAX_LENGTH}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </SectionCard>
            </fieldset>

            {canWrite && (
              <FormStickyFooter
                note={
                  <span className="flex flex-wrap items-center gap-2">
                    {isDirty && <TintBadge label="Cambios sin guardar" tone="cream" />}
                    {initialData ? "Los cambios se ven en la tienda al guardar." : "La marca queda lista para asignarla a productos al crearla."}
                  </span>
                }
              >
                <Button variant="outline" className="min-h-11" disabled={loading || !isDirty} onClick={() => void onDiscard()}>
                  Descartar
                </Button>
                <Button
                  type="submit"
                  form="brand-form"
                  className="min-h-11"
                  disabled={colorBlocked || backgroundCheck === "checking"}
                  isLoading={loading}
                  loadingText={initialData ? "Guardando…" : "Creando…"}
                >
                  {initialData ? "Guardar marca" : "Crear marca"}
                </Button>
              </FormStickyFooter>
            )}
          </form>
        </Form>

        <aside className="flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start">
          <SectionCard id="vista-previa" title="Así se verá en la tienda" description="Con los datos de esta pantalla.">
            <BrandStorePreview
              name={values.name}
              logoUrl={values.logoUrl}
              logoPermission={values.logoPermission}
              color={values.color}
            />
          </SectionCard>
        </aside>
      </div>
    </>
  );
}
