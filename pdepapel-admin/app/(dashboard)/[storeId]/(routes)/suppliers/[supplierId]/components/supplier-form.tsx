"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Supplier } from "@prisma/client";
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
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

const formSchema = z.object({
  name: z.string().min(1, "El nombre del proveedor no puede estar vacío"),
});

type SupplierFormValues = z.infer<typeof formSchema>;

interface SupplierFormProps {
  initialData: Supplier | null;
}

export const SupplierForm: React.FC<SupplierFormProps> = ({ initialData }) => {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const title = initialData ? "Editar proveedor" : "Crear proveedor";
  const description = initialData
    ? "Editar un proveedor"
    : "Crear un nuevo proveedor";
  const toastMessage = initialData
    ? "Proveedor actualizado"
    : "Proveedor creado";
  const action = initialData ? "Guardar cambios" : "Crear";

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      name: "",
    },
  });
  const onSubmit = async (data: SupplierFormValues) => {
    try {
      setLoading(true);
      if (initialData) {
        await axios.patch(
          `/api/${params.storeId}/suppliers/${params.supplierId}`,
          data,
        );
      } else {
        await axios.post(`/api/${params.storeId}/suppliers`, data);
      }
      router.refresh();
      router.push(`/${params.storeId}/suppliers`);
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
        `/api/${params.storeId}/suppliers/${params.supplierId}`,
      );
      router.refresh();
      router.push(`/${params.storeId}/suppliers`);
      toast({
        description: "Proveedor eliminado",
        variant: "success",
      });
    } catch (error) {
      toast({
        description:
          "Asegúrate de haber eliminado todos las productos que usen este proveedor primero.",
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
          <div className="grid grid-cols-3 gap-8">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del proveedor</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Nombre del proveedor"
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