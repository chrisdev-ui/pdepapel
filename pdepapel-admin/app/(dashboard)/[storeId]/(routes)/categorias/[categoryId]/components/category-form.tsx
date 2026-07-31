"use client";

import { useFormPersist } from "@/hooks/use-form-persist";
import { useFormValidationToast } from "@/hooks/use-form-validation-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { Category, Type } from "@prisma/client";
import { Eraser, Loader2, Trash } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Models } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const formSchema = z
  .object({
    name: z
      .string()
      .min(1, "El nombre de la sub-categoría no puede estar vacío"),
    typeId: z.string().min(1),
    seoEnabled: z.boolean().default(false),
    seoTitle: z.string().max(70).optional(),
    seoDescription: z.string().max(170).optional(),
    seoIntro: z.string().max(1200).optional(),
  })
  .superRefine((values, context) => {
    if (!values.seoEnabled) return;

    if (!values.seoTitle?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["seoTitle"],
        message: "El título SEO es requerido para indexar esta categoría",
      });
    }
    if (!values.seoDescription?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["seoDescription"],
        message: "La descripción SEO es requerida para indexar esta categoría",
      });
    }
    if (!values.seoIntro?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["seoIntro"],
        message: "La introducción SEO es requerida para indexar esta categoría",
      });
    }
  });

type CategoryFormValues = z.infer<typeof formSchema>;

interface CategoryFormProps {
  initialData: Category | null;
  types: Type[];
}

export const CategoryForm: React.FC<CategoryFormProps> = ({
  initialData,
  types,
}) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const { title, description, toastMessage, action, pendingText } = useMemo(
    () => ({
      title: initialData ? "Editar sub-categoría" : "Crear sub-categoría",
      description: initialData
        ? "Editar una sub-categoría"
        : "Crear una nueva sub-categoría",
      toastMessage: initialData
        ? "Sub-categoría actualizada"
        : "Sub-categoría creada",
      action: initialData ? "Guardar cambios" : "Crear",
      pendingText: initialData ? "Actualizando..." : "Creando...",
    }),
    [initialData],
  );

  const defaultValues = useMemo(
    () => ({
      name: initialData?.name || "",
      typeId: initialData?.typeId || "",
      seoEnabled: initialData?.seoEnabled || false,
      seoTitle: initialData?.seoTitle || "",
      seoDescription: initialData?.seoDescription || "",
      seoIntro: initialData?.seoIntro || "",
    }),
    [initialData],
  );

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const { clearStorage } = useFormPersist({
    form,
    key: `category-form-${params.storeId}-${initialData?.id ?? "new"}`,
  });

  useFormValidationToast({ form });
  const seoEnabled = form.watch("seoEnabled");

  const onClear = () => {
    form.reset(defaultValues);
    clearStorage();
    toast({
      title: "Formulario limpiado",
      description: "Los datos han sido restablecidos.",
    });
  };

  const onSubmit = async (data: CategoryFormValues) => {
    try {
      setLoading(true);
      if (initialData) {
        await axios.patch(
          `/api/${params.storeId}/${Models.Categories}/${params.categoryId}`,
          data,
        );
      } else {
        await axios.post(`/api/${params.storeId}/${Models.Categories}`, data);
      }
      clearStorage();
      router.refresh();
      router.push(`/${params.storeId}/${Models.Categories}`);
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
        `/api/${params.storeId}/${Models.Categories}/${params.categoryId}`,
      );
      router.refresh();
      router.push(`/${params.storeId}/${Models.Categories}`);
      toast({
        description: "Sub-categoría eliminada",
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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClear} type="button">
            <Eraser className="mr-2 h-4 w-4" />
            Limpiar Formulario
          </Button>
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
      </div>
      <Separator />
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="w-full space-y-8"
        >
          <div className="grid grid-cols-3 gap-8">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Nombre</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Nombre de la sub-categoría"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="typeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Categoría</FormLabel>
                  <Select
                    key={field.value}
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona una categoría" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {types.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="space-y-6 rounded-lg border p-6">
            <FormField
              control={form.control}
              name="seoEnabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) =>
                        field.onChange(checked === true)
                      }
                      disabled={loading}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Indexar página de categoría</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Solo actívalo cuando tengas contenido único y stock
                      estable.
                    </p>
                  </div>
                </FormItem>
              )}
            />
            {seoEnabled && (
              <div className="space-y-6">
                <FormField
                  control={form.control}
                  name="seoTitle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>Título SEO</FormLabel>
                      <FormControl>
                        <Input
                          disabled={loading}
                          placeholder="Ej. Agendas kawaii en Colombia"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="seoDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>Descripción SEO</FormLabel>
                      <FormControl>
                        <Textarea
                          disabled={loading}
                          placeholder="Explica qué encontrará la persona y el beneficio de comprarlo."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="seoIntro"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>
                        Introducción de la categoría
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          disabled={loading}
                          placeholder="Escribe contenido útil y específico para esta categoría."
                          className="min-h-32"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
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
