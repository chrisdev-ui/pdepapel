"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { Size } from "@prisma/client";
import { ArrowLeft, Eraser, Loader2, Trash } from "lucide-react";
import { useForm } from "react-hook-form";
import z from "zod";

import { AlertModal } from "@/components/modals/alert-modal";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Models } from "@/constants";
import {
  DIMENSIONS,
  WEIGHTS,
  generateSizeName,
  generateSizeValue,
  parseSizeValue,
} from "@/constants/sizes";
import { useFormPersist } from "@/hooks/use-form-persist";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const formSchema = z.object({
  dimension: z.string().min(1, "Debes seleccionar una dimensión"),
  weight: z.string().min(1, "Debes seleccionar un peso"),
  name: z.string().min(1, "El nombre del tamaño no puede estar vacío"),
  value: z.string().min(1, "El valor del tamaño no puede estar vacío"),
});

type SizeFormValues = z.infer<typeof formSchema>;

interface SizeFormProps {
  initialData: Size | null;
}

export const SizeForm: React.FC<SizeFormProps> = ({ initialData }) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const { title, description, toastMessage, action, pendingText } = useMemo(
    () => ({
      title: initialData ? "Editar tamaño" : "Crear tamaño",
      description: initialData
        ? "Editar un tamaño"
        : "Crear un nuevo tamaño combinando dimensión y peso",
      toastMessage: initialData ? "Tamaño actualizado" : "Tamaño creado",
      action: initialData ? "Guardar cambios" : "Crear",
      pendingText: initialData ? "Actualizando..." : "Creando...",
    }),
    [initialData],
  );

  // Parse initial data if editing existing size
  const parsedSize = useMemo(() => {
    if (initialData) {
      const parsed = parseSizeValue(initialData.value);
      return parsed || { dimension: "", weight: "" };
    }
    return { dimension: "", weight: "" };
  }, [initialData]);

  const defaultValues = useMemo(
    () =>
      initialData
        ? {
            dimension: parsedSize.dimension,
            weight: parsedSize.weight,
            name: initialData.name,
            value: initialData.value,
          }
        : {
            dimension: "",
            weight: "",
            name: "",
            value: "",
          },
    [initialData, parsedSize],
  );

  const form = useForm<SizeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const { clearStorage } = useFormPersist({
    form,
    key: `size-form-${params.storeId}-${initialData?.id ?? "new"}`,
  });

  const onClear = () => {
    form.reset(defaultValues);
    clearStorage();
    toast({
      title: "Formulario limpiado",
      description: "Los datos han sido restablecidos.",
    });
  };

  // Watch dimension and weight to auto-generate name and value
  const dimension = form.watch("dimension");
  const weight = form.watch("weight");

  useEffect(() => {
    if (dimension && weight) {
      try {
        const generatedName = generateSizeName(dimension, weight);
        const generatedValue = generateSizeValue(dimension, weight);

        form.setValue("name", generatedName);
        form.setValue("value", generatedValue);
      } catch (error) {
        console.error("Error generating size name/value:", error);
      }
    }
  }, [dimension, weight, form]);
  const onSubmit = async (data: SizeFormValues) => {
    try {
      setLoading(true);
      // Only send name and value to API (dimension and weight are just for UI)
      const payload = {
        name: data.name,
        value: data.value,
      };

      if (initialData) {
        await axios.patch(
          `/api/${params.storeId}/${Models.Sizes}/${params.sizeId}`,
          payload,
        );
      } else {
        await axios.post(`/api/${params.storeId}/${Models.Sizes}`, payload);
      }
      clearStorage();
      router.refresh();
      router.push(`/${params.storeId}/${Models.Sizes}`);
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
        `/api/${params.storeId}/${Models.Sizes}/${params.sizeId}`,
      );
      router.refresh();
      router.push(`/${params.storeId}/${Models.Sizes}`);
      toast({
        description: "Tamaño eliminado",
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
          <Heading title={title} description={description} />
        </div>
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
          {/* Dimension and Weight Selectors */}
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <FormField
              control={form.control}
              name="dimension"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Dimensión</FormLabel>
                  <Select
                    key={field.value}
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona una dimensión" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {DIMENSIONS.map((dimension) => (
                        <SelectItem
                          key={dimension.value}
                          value={dimension.value}
                        >
                          {dimension.value} - {dimension.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Tamaño del producto (XS, S, M, L, XL)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="weight"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Peso</FormLabel>
                  <Select
                    key={field.value}
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un peso" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {WEIGHTS.map((weight) => (
                        <SelectItem key={weight.value} value={weight.value}>
                          {weight.value} - {weight.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Peso del producto (Liviano o Pesado)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Generated Name and Value (Read-only preview) */}
          {dimension && weight && (
            <div className="rounded-md border bg-muted/50 p-4">
              <h3 className="mb-3 text-sm font-medium">
                Vista previa del tamaño:
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Nombre</p>
                  <p className="font-medium">{form.watch("name")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Valor</p>
                  <p className="font-medium">{form.watch("value")}</p>
                </div>
              </div>
            </div>
          )}

          {/* Hidden fields for name and value */}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="hidden">
                <FormControl>
                  <input type="hidden" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="value"
            render={({ field }) => (
              <FormItem className="hidden">
                <FormControl>
                  <input type="hidden" {...field} />
                </FormControl>
              </FormItem>
            )}
          />

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
