"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { ArrowLeft, Eraser, Loader2, Mail, PackageCheck, Trash } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AlertModal } from "@/components/modals/alert-modal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AsyncProductSelect } from "@/components/ui/async-product-select";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Heading } from "@/components/ui/heading";
import { ImageUpload } from "@/components/ui/image-upload";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Models } from "@/constants";
import { useFormPersist } from "@/hooks/use-form-persist";
import { useFormValidationToast } from "@/hooks/use-form-validation-toast";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import {
  HOME_CAMPAIGN_TYPES,
  HOME_CONTENT_LIMITS,
  HOME_CONTENT_PLACEMENTS,
  dateToBogotaInput,
  homeContentSchema,
} from "@/lib/home-content";

import type { HomeContentRow } from "../../server/get-home-contents";

const formSchema = homeContentSchema;
type FormValues = z.input<typeof formSchema>;

const EMPTY_PRODUCTS = ["", "", ""];

interface HomeContentFormProps {
  initialData: HomeContentRow | null;
}

export function HomeContentForm({ initialData }: HomeContentFormProps) {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [campaign, setCampaign] = useState<"early-access" | "arrival" | null>(null);
  const storeId = String(params.storeId);
  const listHref = `/${storeId}/contenido`;

  const defaultValues = useMemo<FormValues>(
    () =>
      initialData
        ? {
            placement: initialData.placement,
            campaignType: initialData.campaignType ?? undefined,
            eyebrow: initialData.eyebrow ?? "",
            title: initialData.title,
            subtitle: initialData.subtitle ?? "",
            primaryLabel: initialData.primaryLabel ?? "",
            primaryUrl: initialData.primaryUrl ?? "",
            secondaryLabel: initialData.secondaryLabel ?? "",
            secondaryUrl: initialData.secondaryUrl ?? "",
            imageUrl: initialData.imageUrl ?? "",
            imageAlt: initialData.imageAlt ?? "",
            isActive: initialData.isActive,
            startsAt: dateToBogotaInput(initialData.startsAt),
            endsAt: dateToBogotaInput(initialData.endsAt),
            productIds: initialData.products.map((item) => item.product.id),
          }
        : {
            placement: "HERO",
            campaignType: undefined,
            eyebrow: "",
            title: "",
            subtitle: "",
            primaryLabel: "Ver la tienda",
            primaryUrl: "/tienda",
            secondaryLabel: "",
            secondaryUrl: "",
            imageUrl: "",
            imageAlt: "",
            isActive: true,
            startsAt: dateToBogotaInput(new Date()),
            endsAt: "",
            productIds: [],
          },
    [initialData],
  );

  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues });
  const { clearStorage } = useFormPersist({
    form,
    key: `home-content-form-${storeId}-${initialData?.id ?? "new"}`,
  });
  useFormValidationToast({ form });

  const placement = form.watch("placement");
  const campaignType = form.watch("campaignType");
  const isCampaign = placement === "CAMPAIGN";
  const isShipment = isCampaign && campaignType === "SHIPMENT";
  const productIds = form.watch("productIds") ?? [];

  const onSubmit = async (values: FormValues) => {
    try {
      setLoading(true);
      const payload = { ...values, productIds: (values.productIds ?? []).filter(Boolean) };
      if (initialData) {
        await axios.patch(`/api/${storeId}/${Models.HomeContent}/${initialData.id}`, payload);
      } else {
        await axios.post(`/api/${storeId}/${Models.HomeContent}`, payload);
      }
      clearStorage();
      router.refresh();
      router.push(listHref);
      toast({ description: initialData ? "Contenido actualizado" : "Contenido creado", variant: "success" });
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async () => {
    if (!initialData) return;
    try {
      setLoading(true);
      await axios.delete(`/api/${storeId}/${Models.HomeContent}/${initialData.id}`);
      router.refresh();
      router.push(listHref);
      toast({ description: "Contenido eliminado", variant: "success" });
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  const onClear = async () => {
    const currentImage = form.getValues("imageUrl");
    if (currentImage && currentImage !== initialData?.imageUrl) {
      const { cleanupImages } = await import("@/actions/cleanup-images");
      await cleanupImages([currentImage]);
    }
    form.reset(defaultValues);
    clearStorage();
    toast({ title: "Formulario limpiado", description: "Los datos han sido restablecidos." });
  };

  const sendCampaign = async () => {
    if (!initialData || !campaign) return;
    try {
      setLoading(true);
      const response = await axios.post<{ message: string }>(`/api/${storeId}/newsletter/campaigns`, {
        kind: campaign,
        homeContentId: initialData.id,
      });
      toast({ description: response.data.message, variant: "success" });
      router.refresh();
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
      setCampaign(null);
    }
  };

  const setProductAt = (index: number, value: string) => {
    const next = [...EMPTY_PRODUCTS].map((_, i) => productIds[i] ?? "");
    next[index] = value;
    form.setValue("productIds", next.filter(Boolean), { shouldDirty: true });
  };

  return (
    <>
      <AlertModal isOpen={open} onClose={() => setOpen(false)} onConfirm={onDelete} loading={loading} />
      <AlertDialog open={campaign !== null} onOpenChange={(value) => !value && setCampaign(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{campaign === "early-access" ? "¿Enviar el acceso anticipado?" : "¿Avisar que ya llegó?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {campaign === "early-access"
                ? "Cada suscriptora confirmada recibe un enlace firmado para comprar los productos «Próximamente» de este banner antes de su fecha. Se envía una sola vez."
                : "Cada suscriptora confirmada recibe el aviso con los productos y el enlace a lo nuevo. Se envía una sola vez."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={sendCampaign} disabled={loading}>
              {loading ? "Enviando…" : "Sí, enviar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => router.push(listHref)} aria-label="Volver">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Heading
            title={initialData ? "Editar contenido de portada" : "Nuevo contenido de portada"}
            description="El hero es el primer pantallazo de la tienda; el banner de campaña solo aparece mientras está vigente."
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClear} type="button">
            <Eraser className="mr-2 h-4 w-4" />
            Limpiar
          </Button>
          {initialData && (
            <Button disabled={loading} variant="destructive" size="sm" onClick={() => setOpen(true)} aria-label="Eliminar">
              <Trash className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <Separator />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="w-full space-y-8">
          <section className="grid gap-6 md:grid-cols-2">
            <FormField
              control={form.control}
              name="placement"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Ubicación</FormLabel>
                  <Select disabled={loading} onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Elige dónde se muestra" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {HOME_CONTENT_PLACEMENTS.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {HOME_CONTENT_PLACEMENTS.find((item) => item.id === field.value)?.description}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isCampaign && (
              <FormField
                control={form.control}
                name="campaignType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel isRequired>Tipo de campaña</FormLabel>
                    <Select disabled={loading} onValueChange={field.onChange} value={field.value ?? undefined}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Elige el tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {HOME_CAMPAIGN_TYPES.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {HOME_CAMPAIGN_TYPES.find((item) => item.id === field.value)?.description}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </section>

          <section className="grid gap-6">
            <FormField
              control={form.control}
              name="eyebrow"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Etiqueta corta</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      maxLength={HOME_CONTENT_LIMITS.eyebrow}
                      placeholder={isCampaign ? "Temporada escolar · hasta el 30 de septiembre" : "Nuevo esta semana: llegó Sanrio"}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormDescription>La píldora que va sobre el título. Opcional.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Título</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      maxLength={HOME_CONTENT_LIMITS.title}
                      placeholder={isCampaign ? "Arma tu kit con los útiles más lindos del semestre" : "Papelería kawaii desde Medellín con envíos a toda Colombia"}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {placement === "HERO"
                      ? "Es el H1 de la portada: di qué vendes y desde dónde. Ideal hasta 70 caracteres."
                      : "Una frase corta, ideal hasta 60 caracteres."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="subtitle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Textarea
                      disabled={loading}
                      rows={3}
                      maxLength={HOME_CONTENT_LIMITS.subtitle}
                      placeholder="Agendas, cuadernos, útiles y regalos que dan ganas de estudiar."
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormDescription>Ideal hasta 160 caracteres.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </section>

          <section className="grid gap-6 md:grid-cols-2">
            <FormField
              control={form.control}
              name="primaryLabel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Botón principal</FormLabel>
                  <FormControl>
                    <Input disabled={loading} maxLength={HOME_CONTENT_LIMITS.buttonLabel} placeholder="Ver la tienda" {...field} value={field.value ?? ""} />
                  </FormControl>
                  {isShipment && (
                    <FormDescription>En un cargamento el botón pide el correo; déjalo vacío para usar «Quiero acceso anticipado».</FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="primaryUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Enlace del botón principal</FormLabel>
                  <FormControl>
                    <Input disabled={loading} placeholder="/tienda" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormDescription>Ruta interna (/tienda) o URL completa.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {!isShipment && (
              <>
                <FormField
                  control={form.control}
                  name="secondaryLabel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Botón secundario</FormLabel>
                      <FormControl>
                        <Input disabled={loading} maxLength={HOME_CONTENT_LIMITS.buttonLabel} placeholder="Ver novedades" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="secondaryUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Enlace del botón secundario</FormLabel>
                      <FormControl>
                        <Input disabled={loading} placeholder="/tienda?sortOption=newest" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
          </section>

          {isShipment ? (
            <section className="grid gap-4">
              <div>
                <h2 className="text-base font-semibold text-primary">Productos que vienen</h2>
                <p className="text-sm text-muted-foreground">
                  Hasta {HOME_CONTENT_LIMITS.teaserProducts} productos marcados «Próximamente» en el catálogo. Se muestran en la portada con la etiqueta «Llega pronto».
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {EMPTY_PRODUCTS.map((_, index) => (
                  <AsyncProductSelect
                    key={index}
                    disabled={loading}
                    value={productIds[index] ?? ""}
                    onChange={(value) => setProductAt(index, value)}
                    placeholder={`Producto ${index + 1}`}
                    ariaLabel={`Producto ${index + 1} del cargamento`}
                  />
                ))}
              </div>
              <FormField control={form.control} name="productIds" render={() => <FormMessage />} />
              {initialData && (
                <div className="flex flex-col gap-3 rounded-lg border p-4">
                  <div>
                    <h3 className="text-sm font-semibold text-primary">Correos a las suscriptoras</h3>
                    <p className="text-xs text-muted-foreground">
                      Guarda primero los productos. Cada correo se envía una sola vez a las suscriptoras confirmadas.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={loading || Boolean(initialData.earlyAccessSentAt)} onClick={() => setCampaign("early-access")}>
                      <Mail className="mr-2 h-4 w-4" />
                      {initialData.earlyAccessSentAt ? `Acceso anticipado enviado el ${new Date(initialData.earlyAccessSentAt).toLocaleDateString("es-CO")}` : "Enviar acceso anticipado"}
                    </Button>
                    <Button type="button" variant="outline" size="sm" disabled={loading || Boolean(initialData.arrivalSentAt)} onClick={() => setCampaign("arrival")}>
                      <PackageCheck className="mr-2 h-4 w-4" />
                      {initialData.arrivalSentAt ? `Aviso de llegada enviado el ${new Date(initialData.arrivalSentAt).toLocaleDateString("es-CO")}` : "Avisar que ya llegó"}
                    </Button>
                  </div>
                </div>
              )}
            </section>
          ) : null}

          <section className="grid gap-6">
            <FormField
              control={form.control}
              name="imageUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired={!isShipment}>Imagen</FormLabel>
                  <FormControl>
                    <ImageUpload
                      value={field.value ? [{ url: field.value, isMain: true }] : []}
                      disabled={loading}
                      onChange={(images) => field.onChange(images.length > 0 ? images[0].url : "")}
                      onRemove={() => field.onChange("")}
                    />
                  </FormControl>
                  <FormDescription>
                    {placement === "HERO"
                      ? "Horizontal, mínimo 1280 × 800 px (8:5). Sin texto dentro de la imagen."
                      : isShipment
                        ? "Opcional: si eliges productos, la portada los muestra en lugar de la foto."
                        : "Horizontal, mínimo 1040 × 600 px. Sin texto dentro de la imagen."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="imageAlt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Texto alternativo de la imagen</FormLabel>
                  <FormControl>
                    <Input disabled={loading} maxLength={HOME_CONTENT_LIMITS.imageAlt} placeholder="Novedades de Sanrio sobre un escritorio kawaii" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormDescription>Describe la foto para lectores de pantalla y buscadores.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </section>

          <section className="grid gap-6 md:grid-cols-3">
            <FormField
              control={form.control}
              name="startsAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Desde</FormLabel>
                  <FormControl>
                    <DateField value={field.value} onChange={field.onChange} disabled={loading} aria-label="Fecha de inicio" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="endsAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hasta</FormLabel>
                  <FormControl>
                    <DateField value={field.value ?? ""} onChange={field.onChange} disabled={loading} clearable aria-label="Fecha de fin" />
                  </FormControl>
                  <FormDescription>Al cumplirse, la entrada pasa a Vencida sin tocar nada.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>Publicada</FormLabel>
                    <FormDescription>Desactívala para guardarla como borrador.</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} disabled={loading} />
                  </FormControl>
                </FormItem>
              )}
            />
          </section>

          <Button disabled={loading} className="ml-auto" type="submit">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando…
              </>
            ) : initialData ? (
              "Guardar cambios"
            ) : (
              "Crear"
            )}
          </Button>
        </form>
      </Form>
    </>
  );
}
