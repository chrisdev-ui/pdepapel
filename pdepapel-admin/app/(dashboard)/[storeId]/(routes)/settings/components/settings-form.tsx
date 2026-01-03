"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Store } from "@prisma/client";
import {
  AlertTriangle,
  ArrowLeft,
  AtSign,
  Eraser,
  Facebook,
  Instagram,
  Loader2,
  MapPinned,
  Phone,
  Store as StoreIcon,
  Trash,
  Twitter,
  Youtube,
} from "lucide-react";
import { useForm } from "react-hook-form";
import z from "zod";

import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { AlertModal } from "@/components/modals/alert-modal";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ApiAlert } from "@/components/ui/api-alert";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Heading } from "@/components/ui/heading";
import { Icons } from "@/components/ui/icons";
import { ImageUpload } from "@/components/ui/image-upload";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Separator } from "@/components/ui/separator";
import { useFormPersist } from "@/hooks/use-form-persist";
import { useOrigin } from "@/hooks/use-origin";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

interface SettingsFormProps {
  initialData: Store & {
    policies: {
      shipping?: string;
      returns?: string;
      payment?: string;
    } | null;
  };
}

const formSchema = z.object({
  name: z.string().min(1, "El nombre de la tienda no puede estar vacío"),
  logoUrl: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("El email no es válido").optional().or(z.literal("")),
  address: z.string().optional(),
  instagram: z.string().optional(),
  tiktok: z.string().optional(),
  youtube: z.string().optional(),
  facebook: z.string().optional(),
  twitter: z.string().optional(),
  pinterest: z.string().optional(),
  policies: z
    .object({
      shipping: z.string().optional(),
      returns: z.string().optional(),
      payment: z.string().optional(),
    })
    .optional(),
});

type SettingsFormValues = z.infer<typeof formSchema>;

export const SettingsForm: React.FC<SettingsFormProps> = ({ initialData }) => {
  const params = useParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const origin = useOrigin();
  const [loading, setLoading] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const { toast } = useToast();

  const defaultValues = useMemo(
    () => ({
      name: initialData.name,
      logoUrl: initialData.logoUrl || "",
      phone: initialData.phone || "",
      email: initialData.email || "",
      address: initialData.address || "",
      instagram: initialData.instagram || "",
      facebook: initialData.facebook || "",
      tiktok: initialData.tiktok || "",
      twitter: initialData.twitter || "",
      youtube: initialData.youtube || "",
      pinterest: initialData.pinterest || "",
      policies:
        typeof initialData.policies === "string"
          ? JSON.parse(initialData.policies)
          : {
              shipping: "",
              returns: "",
              payment: "",
            },
    }),
    [initialData],
  );

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const { clearStorage } = useFormPersist({
    form,
    key: `settings-form-${params.storeId}`,
  });

  const onClear = async () => {
    const currentLogo = form.getValues("logoUrl");
    if (currentLogo && currentLogo !== initialData.logoUrl) {
      const { cleanupImages } = await import("@/actions/cleanup-images");
      await cleanupImages([currentLogo]);
    }

    form.reset(defaultValues);
    clearStorage();
    toast({
      title: "Formulario limpiado",
      description: "Los datos han sido restablecidos.",
    });
  };

  const onSubmit = async (values: SettingsFormValues) => {
    try {
      setLoading(true);
      await axios.patch(`/api/stores/${params.storeId}`, values);
      clearStorage();
      router.refresh();
      toast({
        description: "¡Listo! Los cambios se han guardado correctamente.",
        variant: "success",
      });
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  const onDelete = async () => {
    try {
      setLoading(true);
      await axios.delete(`/api/stores/${params.storeId}`);
      router.refresh();
      router.push("/");
      toast({
        description: "La tienda se ha eliminado correctamente.",
        variant: "success",
      });
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };
  return (
    <>
      <AlertModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={onDelete}
        loading={loading}
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Heading
            title="Ajustes"
            description="Maneja las preferencias e información de la tienda"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClear} type="button">
            <Eraser className="mr-2 h-4 w-4" />
            Limpiar Formulario
          </Button>
          <Button
            disabled={loading}
            variant="destructive"
            size="sm"
            onClick={() => setOpen(true)}
          >
            <Trash className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <Separator />
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="w-full space-y-8"
        >
          <FormField
            control={form.control}
            name="logoUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Logo de la tienda</FormLabel>
                <FormControl>
                  <ImageUpload
                    value={
                      field.value ? [{ url: field.value, isMain: true }] : []
                    }
                    disabled={loading}
                    onChange={(images) =>
                      field.onChange(images.length > 0 ? images[0].url : "")
                    }
                    onRemove={() => field.onChange("")}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-1 gap-8">
            <div className="space-y-6">
              <Heading
                title="Información básica"
                description="Datos principales de la tienda"
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired className="flex items-center gap-2">
                        <StoreIcon className="h-4 w-4" />
                        Nombre
                      </FormLabel>
                      <FormControl>
                        <Input
                          disabled={loading}
                          placeholder="Nombre de la tienda"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <AtSign className="h-4 w-4" />
                        Correo electrónico
                      </FormLabel>
                      <FormControl>
                        <Input
                          disabled={loading}
                          placeholder="Email de contacto"
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
                      <FormLabel className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        Teléfono
                      </FormLabel>
                      <FormControl>
                        <PhoneInput
                          disabled={loading}
                          placeholder=""
                          value={field.value}
                          onChange={field.onChange}
                          defaultCountry="CO"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <MapPinned className="h-4 w-4" />
                        Dirección
                      </FormLabel>
                      <FormControl>
                        <Input
                          disabled={loading}
                          placeholder="Dirección física"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="space-y-6">
              <Heading
                title="Redes sociales"
                description="Enlaces a redes sociales"
              />
              <div className="grid grid-cols-3 gap-8">
                <FormField
                  control={form.control}
                  name="instagram"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Instagram className="h-3.5 w-3.5" />
                        Instagram
                      </FormLabel>
                      <FormControl>
                        <Input
                          disabled={loading}
                          placeholder="@usuario"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="facebook"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Facebook className="h-3.5 w-3.5" />
                        Facebook
                      </FormLabel>
                      <FormControl>
                        <Input
                          disabled={loading}
                          placeholder="/pagina"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tiktok"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Icons.tiktok className="h-3.5 w-3.5" />
                        Tiktok
                      </FormLabel>
                      <FormControl>
                        <Input
                          disabled={loading}
                          placeholder="@usuario"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="youtube"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Youtube className="h-3.5 w-3.5" />
                        Youtube
                      </FormLabel>
                      <FormControl>
                        <Input
                          disabled={loading}
                          placeholder="canal"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="twitter"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Twitter className="h-3.5 w-3.5" />
                        Twitter
                      </FormLabel>
                      <FormControl>
                        <Input
                          disabled={loading}
                          placeholder="@usuario"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="pinterest"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Icons.pinterest className="h-3.5 w-3.5" />
                        Pinterest
                      </FormLabel>
                      <FormControl>
                        <Input
                          disabled={loading}
                          placeholder="@usuario"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="space-y-6">
              <Heading
                title="Políticas de la tienda"
                description="Información para el catálogo"
              />
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="shipping">
                  <AccordionTrigger>Política de envíos</AccordionTrigger>
                  <AccordionContent>
                    <FormField
                      control={form.control}
                      name="policies.shipping"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <RichTextEditor
                              value={field.value}
                              onChange={field.onChange}
                              placeholder="Describe tu política de envíos"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="returns">
                  <AccordionTrigger>Política de devoluciones</AccordionTrigger>
                  <AccordionContent>
                    <FormField
                      control={form.control}
                      name="policies.returns"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <RichTextEditor
                              value={field.value}
                              onChange={field.onChange}
                              placeholder="Describe tu política de devoluciones"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="payment">
                  <AccordionTrigger>Métodos de pago</AccordionTrigger>
                  <AccordionContent>
                    <FormField
                      control={form.control}
                      name="policies.payment"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <RichTextEditor
                              value={field.value}
                              onChange={field.onChange}
                              placeholder="Describe los métodos de pago aceptados"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>

          <div className="space-y-4">
            <Heading
              title="Migración de datos"
              description="Herramientas para migrar datos al nuevo sistema"
            />
            <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-blue-800">
                    Activar Historial de Inventario
                  </p>
                  <p className="text-sm text-blue-600">
                    Guarda tu inventario actual como punto de partida para
                    comenzar a registrar todos los movimientos de tus productos.
                    <br />
                    <span className="font-bold">
                      IMPORTANTE: Ejecutar solo una vez.
                    </span>
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading || migrating}
                  className="min-w-[140px] border-blue-600 text-blue-800 hover:bg-blue-100"
                  onClick={async () => {
                    if (
                      !confirm(
                        "¿Estás seguro? Esta acción debe realizarse solo una vez para inicializar el historial.",
                      )
                    ) {
                      return;
                    }
                    try {
                      setMigrating(true);
                      setLoading(true); // Helper to disable other actions too
                      const response = await axios.post(
                        `/api/${params.storeId}/migration/inventory`,
                      );
                      toast({
                        title: "Migración completada",
                        description: `Se procesaron ${response.data.migrated} productos.`,
                        variant: "success",
                      });
                    } catch (error) {
                      toast({
                        description: getErrorMessage(error),
                        variant: "destructive",
                      });
                    } finally {
                      setLoading(false);
                      setMigrating(false);
                    }
                  }}
                >
                  {migrating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Migrando...
                    </>
                  ) : (
                    "Ejecutar Migración"
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Development Tools Section - Only visible in DEV or if folder name is set */}
          {process.env.NODE_ENV === "development" && (
            <>
              <Separator />
              <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4">
                <div className="mb-4 flex items-center gap-2 text-yellow-800">
                  <AlertTriangle className="h-5 w-5" />
                  <h3 className="font-semibold">Zona de Desarrollo</h3>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-yellow-800">
                      Limpiar imágenes de desarrollo
                    </p>
                    <p className="text-sm text-yellow-600">
                      Elimina todas las imágenes en la carpeta{" "}
                      <code className="rounded bg-yellow-100 px-1 font-bold">
                        {process.env.NEXT_PUBLIC_CLOUDINARY_FOLDER_NAME ||
                          "No configurada"}
                      </code>
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={loading}
                    className="border-yellow-600 text-yellow-800 hover:bg-yellow-100"
                    onClick={async () => {
                      if (
                        !confirm(
                          "¿Estás seguro? Esto eliminará PERMANENTEMENTE todas las imágenes de desarrollo.",
                        )
                      )
                        return;
                      try {
                        setLoading(true);
                        await axios.post(
                          `/api/${params.storeId}/cleanup-images`,
                        );
                        toast({
                          title: "Limpieza completada",
                          description:
                            "Se han eliminado las imágenes de desarrollo.",
                          variant: "success",
                        });
                      } catch (error) {
                        toast({
                          description: getErrorMessage(error),
                          variant: "destructive",
                        });
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    Limpiar Imágenes
                  </Button>
                </div>
              </div>
            </>
          )}

          <Button disabled={loading} className="ml-auto" type="submit">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              "Guardar cambios"
            )}
          </Button>
        </form>
      </Form>
      <Separator />
      <ApiAlert
        title="NEXT_PUBLIC_API_URL"
        description={origin ? `${origin}/api/${params.storeId}` : ""}
        variant="public"
      />
    </>
  );
};
