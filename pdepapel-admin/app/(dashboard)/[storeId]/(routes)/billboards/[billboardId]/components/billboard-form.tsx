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
import { Models } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { Billboard } from "@prisma/client";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const formSchema = z.object({
  label: z.string().min(1, "La etiqueta no puede estar vacía"),
  title: z.string().optional(),
  redirectUrl: z.string().optional(),
  imageUrl: z.string().min(1, "La URL de la imagen no puede estar vacía"),
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

  const { title, description, toastMessage, action } = useMemo(
    () => ({
      title: initialData ? "Editar publicación" : "Crear publicación",
      description: initialData
        ? "Editar una publicación"
        : "Crear una nueva publicación",
      toastMessage: initialData
        ? "Publicación actualizada"
        : "Publicación creada",
      action: initialData ? "Guardar cambios" : "Crear",
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
        }
      : {
          label: "",
          imageUrl: "",
          title: "",
          redirectUrl: "",
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
        description: "Publicación eliminada",
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
          <FormField
            control={form.control}
            name="imageUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Background image</FormLabel>
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
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Etiqueta</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Etiqueta de la publicación"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Título de la publicación (Opcional)"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="redirectUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Link de redirección</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Link de redirección (Opcional)"
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
