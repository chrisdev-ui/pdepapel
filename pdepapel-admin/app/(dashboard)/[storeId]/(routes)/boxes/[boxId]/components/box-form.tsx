"use client";

import { useFormPersist } from "@/hooks/use-form-persist";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { Box } from "@prisma/client";
import axios from "axios";
import { ArrowLeft, Eraser, Trash } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { AlertModal } from "@/components/modals/alert-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Box3DPreview } from "./box-3d-preview";

const formSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  width: z.coerce.number().min(1),
  height: z.coerce.number().min(1),
  length: z.coerce.number().min(1),
  isDefault: z.boolean().default(false),
});

type BoxFormValues = z.infer<typeof formSchema>;

interface BoxFormProps {
  initialData: Box | null;
  storeLogoUrl?: string | null;
}

export const BoxForm: React.FC<BoxFormProps> = ({
  initialData,
  storeLogoUrl,
}) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const title = initialData ? "Editar caja" : "Crear caja";
  const description = initialData ? "Editar caja" : "Agregar una nueva caja";
  const toastMessage = initialData ? "Caja actualizada." : "Caja creada.";
  const action = initialData ? "Guardar cambios" : "Crear";

  const defaultValues = useMemo(
    () =>
      initialData || {
        name: "",
        type: "M",
        width: 0,
        height: 0,
        length: 0,
        isDefault: false,
      },
    [initialData],
  );

  const form = useForm<BoxFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const { clearStorage } = useFormPersist({
    form,
    key: `box-form-${params.storeId}-${initialData?.id ?? "new"}`,
  });

  const onClear = () => {
    form.reset(defaultValues);
    clearStorage();
    toast({
      title: "Formulario limpiado",
      description: "Los datos han sido restablecidos.",
    });
  };

  const onSubmit = async (data: BoxFormValues) => {
    try {
      setLoading(true);
      if (initialData) {
        await axios.patch(`/api/${params.storeId}/boxes/${params.boxId}`, data);
      } else {
        await axios.post(`/api/${params.storeId}/boxes`, data);
      }
      clearStorage();
      router.refresh();
      router.push(`/${params.storeId}/boxes`);
      toast({
        title: toastMessage,
        variant: "default",
      });
    } catch (error) {
      toast({
        title: "Algo salió mal.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async () => {
    try {
      setLoading(true);
      await axios.delete(`/api/${params.storeId}/boxes/${params.boxId}`);
      router.refresh();
      router.push(`/${params.storeId}/boxes`);
      toast({
        title: "Caja eliminada.",
        variant: "default",
      });
    } catch (error) {
      toast({
        title:
          "Algo salió mal. Asegúrate de que no hay envíos utilizando esta caja.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  const width = form.watch("width");
  const height = form.watch("height");
  const length = form.watch("length");

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
              size="icon"
              onClick={() => setOpen(true)}
            >
              <Trash className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <Separator />

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="w-full space-y-8"
          >
            <div className="grid grid-cols-1 gap-8">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel isRequired>Nombre</FormLabel>
                    <FormControl>
                      <Input
                        disabled={loading}
                        placeholder="Nombre de la caja"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel isRequired>Tipo</FormLabel>
                    <Select
                      key={field.value}
                      disabled={loading}
                      onValueChange={field.onChange}
                      value={field.value}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="XS">XS</SelectItem>
                        <SelectItem value="S">S</SelectItem>
                        <SelectItem value="M">M</SelectItem>
                        <SelectItem value="L">L</SelectItem>
                        <SelectItem value="XL">XL</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="width"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>Ancho (cm)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          disabled={loading}
                          placeholder="20"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="height"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>Alto (cm)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          disabled={loading}
                          placeholder="10"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="length"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel isRequired>Largo (cm)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          disabled={loading}
                          placeholder="30"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="isDefault"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Predeterminado para este tipo</FormLabel>
                      <FormDescription>
                        Esta caja será la preferida para cálculos automáticos
                        cuando se seleccione este tipo.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </div>
            <Button disabled={loading} className="ml-auto" type="submit">
              {action}
            </Button>
          </form>
        </Form>

        <Box3DPreview
          width={width}
          height={height}
          length={length}
          logoUrl={storeLogoUrl || undefined}
        />
      </div>
    </>
  );
};
