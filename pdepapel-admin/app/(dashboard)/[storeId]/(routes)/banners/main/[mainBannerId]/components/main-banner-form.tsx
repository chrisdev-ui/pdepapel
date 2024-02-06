"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Trash } from "lucide-react";
import { useForm } from "react-hook-form";
import z from "zod";

import { AlertModal } from "@/components/modals/alert-modal";
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
import { ImageUpload } from "@/components/ui/image-upload";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { MainBanner } from "@prisma/client";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

const formSchema = z.object({
  title: z.string().optional(),
  label1: z.string().optional(),
  highlight: z.string().optional(),
  label2: z.string().optional(),
  callToAction: z.string().min(1, "La URL de redirección no puede estar vacía"),
  imageUrl: z.string().min(1, "La URL de la imagen no puede estar vacía"),
});

type MainBannerFormValues = z.infer<typeof formSchema>;

interface MainBannerFormProps {
  initialData: MainBanner | null;
}

export const MainBannerForm: React.FC<MainBannerFormProps> = ({
  initialData,
}) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const title = initialData
    ? "Editar banner principal"
    : "Crear banner principal";
  const description = initialData
    ? "Editar un banner principal"
    : "Crear un nuevo banner principal";
  const toastMessage = initialData
    ? "Banner principal actualizado"
    : "Banner principal creado";
  const action = initialData ? "Guardar cambios" : "Crear";

  const form = useForm<MainBannerFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData
      ? {
          ...initialData,
          title: initialData.title || "",
          label1: initialData.label1 || "",
          label2: initialData.label2 || "",
          highlight: initialData.highlight || "",
        }
      : {
          title: "",
          label1: "",
          label2: "",
          highlight: "",
          callToAction: "",
          imageUrl: "",
        },
  });
  const onSubmit = async (data: MainBannerFormValues) => {
    try {
      setLoading(true);
      if (initialData) {
        await axios.patch(
          `/api/${params.storeId}/main-banner/${params.mainBannerId}`,
          data,
        );
      } else {
        await axios.post(`/api/${params.storeId}/main-banner`, data);
      }
      router.refresh();
      router.push(`/${params.storeId}/banners`);
      toast({
        description: toastMessage,
        variant: "success",
      });
    } catch (error) {
      toast({
        description:
          "¡Ups! Algo salió mal. Por favor, verifica tu conexión e inténtalo nuevamente más tarde.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  const onDelete = async () => {
    try {
      setLoading(true);
      await axios.delete(
        `/api/${params.storeId}/main-banner/${params.mainBannerId}`,
      );
      router.refresh();
      router.push(`/${params.storeId}/banners`);
      toast({
        description: "Banner eliminado",
        variant: "success",
      });
    } catch (error) {
      toast({
        description:
          "Ups! Algo salió mal. Por favor, verifica tu conexión e inténtalo nuevamente más tarde.",
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
        <Heading title={title} description={description} />
        {initialData && (
          <Button
            disabled={loading}
            variant="destructive"
            size="sm"
            onClick={() => setOpen(true)}
          >
            <Trash className="h-4 w-4" />
          </Button>
        )}
      </div>
      <Separator />
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="w-full space-y-8"
        >
          <FormField
            control={form.control}
            name="imageUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Background image</FormLabel>
                <FormControl>
                  <ImageUpload
                    value={field.value ? [field.value] : []}
                    disabled={loading}
                    onChange={(url) => field.onChange(url)}
                    onRemove={() => field.onChange("")}
                    tags={["main-banner"]}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-3 gap-8">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Título (opcional)"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="label1"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Párrafo 1</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Primer párrafo (opcional)"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="highlight"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Texto destacado</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Texto destacado (opcional)"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="label2"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Párrafo 2</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Segundo parrafo (opcional)"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="callToAction"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL de redirección para la publicidad</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="URL de redirección (#)"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <Button disabled={loading} className="ml-auto" type="submit">
            {action}
          </Button>
        </form>
      </Form>
    </>
  );
};
