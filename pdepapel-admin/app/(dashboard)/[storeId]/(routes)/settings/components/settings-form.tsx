"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Store } from "@prisma/client";
import {
  AtSign,
  Facebook,
  Instagram,
  MapPinned,
  Phone,
  Store as StoreIcon,
  Trash,
  Twitter,
  Youtube,
} from "lucide-react";
import { useForm } from "react-hook-form";
import z from "zod";

import { AlertModal } from "@/components/modals/alert-modal";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useOrigin } from "@/hooks/use-origin";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

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
  const { toast } = useToast();

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
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
    },
  });
  const onSubmit = async (values: SettingsFormValues) => {
    try {
      setLoading(true);
      await axios.patch(`/api/stores/${params.storeId}`, values);
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
        <Heading
          title="Ajustes"
          description="Maneja las preferencias e información de la tienda"
        />
        <Button
          disabled={loading}
          variant="destructive"
          size="sm"
          onClick={() => setOpen(true)}
        >
          <Trash className="h-4 w-4" />
        </Button>
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
                      <FormLabel className="flex items-center gap-2">
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
                        <Input
                          disabled={loading}
                          placeholder="Teléfono de contacto"
                          {...field}
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
              <div className="grid grid-cols-1 gap-4">
                <FormField
                  control={form.control}
                  name="policies.shipping"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Política de envíos</FormLabel>
                      <FormControl>
                        <Textarea
                          disabled={loading}
                          placeholder="Describe tu política de envíos"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="policies.returns"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Política de devoluciones</FormLabel>
                      <FormControl>
                        <Textarea
                          disabled={loading}
                          placeholder="Describe tu política de devoluciones"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="policies.payment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Métodos de pago</FormLabel>
                      <FormControl>
                        <Textarea
                          disabled={loading}
                          placeholder="Describe los métodos de pago aceptados"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </div>

          <Button disabled={loading} className="ml-auto" type="submit">
            Guardar cambios
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
