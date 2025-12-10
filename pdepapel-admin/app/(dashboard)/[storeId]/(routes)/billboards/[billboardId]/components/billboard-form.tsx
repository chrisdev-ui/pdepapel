"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Lightbulb, Loader2, Trash } from "lucide-react";
import { useForm } from "react-hook-form";
import z from "zod";

import { AlertModal } from "@/components/modals/alert-modal";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { Separator } from "@/components/ui/separator";
import { Models } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { Billboard } from "@prisma/client";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const formSchema = z.object({
  title: z.string().min(1, "El título es requerido"),
  label: z.string().min(1, "La descripción es requerida"),
  buttonLabel: z.string().min(1, "El texto del botón es requerido"),
  redirectUrl: z.union([
    z.string().url({ message: "Debe ser una URL válida (https://...)" }),
    z.string().startsWith("/", {
      message: "Las rutas internas deben comenzar con /",
    }),
  ]),
  imageUrl: z.string().min(1, "La URL de la imagen es requerida"),
});

type BillboardFormValues = z.infer<typeof formSchema>;

interface BillboardFormProps {
  initialData: Billboard | null;
}

export const BillboardForm: React.FC<BillboardFormProps> = ({
  initialData,
}) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const { title, description, toastMessage, action, pendingText } = useMemo(
    () => ({
      title: initialData ? "Editar diapositiva" : "Crear diapositiva",
      description: initialData
        ? "Editar una diapositiva"
        : "Crear una nueva diapositiva",
      toastMessage: initialData
        ? "Diapositiva actualizada"
        : "Publicación creada",
      action: initialData ? "Guardar cambios" : "Crear",
      pendingText: initialData ? "Actualizando..." : "Creando...",
    }),
    [initialData],
  );

  const form = useForm<BillboardFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData
      ? {
          ...initialData,
          title: initialData.title ?? "",
          redirectUrl: initialData.redirectUrl ?? "",
          buttonLabel: initialData.buttonLabel ?? "",
        }
      : {
          label: "",
          imageUrl: "",
          title: "",
          redirectUrl: "",
          buttonLabel: "",
        },
  });
  const onSubmit = async (data: BillboardFormValues) => {
    try {
      setLoading(true);
      if (initialData) {
        await axios.patch(
          `/api/${params.storeId}/${Models.Billboards}/${params.billboardId}`,
          data,
        );
      } else {
        await axios.post(`/api/${params.storeId}/${Models.Billboards}`, data);
      }
      router.refresh();
      router.push(`/${params.storeId}/${Models.Billboards}`);
      toast({
        description: toastMessage,
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
      await axios.delete(
        `/api/${params.storeId}/${Models.Billboards}/${params.billboardId}`,
      );
      router.refresh();
      router.push(`/${params.storeId}/${Models.Billboards}`);
      toast({
        description: "Diapositiva eliminada",
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
          <Alert>
            <Lightbulb className="h-4 w-4" />
            <AlertTitle>Tip</AlertTitle>
            <AlertDescription>
              Usa <code>Click Derecho &gt; Emojis y Símbolos</code> para
              insertar emojis en los campos de texto, o visita{" "}
              <a
                href="https://getemoji.com"
                target="_blank"
                rel="noreferrer"
                className="font-bold underline"
              >
                GetEmoji
              </a>{" "}
              para copiar y pegar.
            </AlertDescription>
          </Alert>
          <FormField
            control={form.control}
            name="imageUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel isRequired>Imagen de fondo</FormLabel>
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
          <div className="grid grid-cols-3 gap-8">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Título</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Título de la diapositiva"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Puedes usar emojis, símbolos y caracteres especiales para
                    hacer el título más atractivo. Ejemplo: Nueva Colección ✨
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Descripción</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Descripción de la diapositiva"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Puedes usar emojis, símbolos y caracteres especiales para
                    hacer la descripción más atractiva. Ejemplo: Hasta 40% de
                    descuento en tus favoritos 🌸
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="buttonLabel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Texto del botón</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Texto del botón"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Puedes usar emojis, símbolos y caracteres especiales para
                    hacer el texto del botón más atractivo. Ejemplo: ¡Explorar!
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="redirectUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Link de redirección</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Link de redirección"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    La URL puede ser una página web o una ruta interna de la
                    tienda. Ejemplo: /products/nuevo o https://google.com
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <Button disabled={loading} className="ml-auto" type="submit">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {pendingText}
              </>
            ) : (
              action
            )}
          </Button>
        </form>
      </Form>
    </>
  );
};
