"use client";

import { useStoreModal } from "@/hooks/use-store-modal";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

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
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useFormValidationToast } from "@/hooks/use-form-validation-toast";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import axios from "axios";

const formSchema = z.object({
  name: z.string().min(1, "El nombre debe tener al menos un caracter"),
});

export function StoreModal() {
  const storeModal = useStoreModal();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  // Crear una tienda era un clic sin vuelta atrás: ahora se confirma con el
  // nombre a la vista, porque la tienda nueva nace vacía y separada.
  const [pendingName, setPendingName] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
    },
  });

  useFormValidationToast({ form });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    setPendingName(values.name.trim());
  };

  const createStore = async () => {
    if (!pendingName) return;
    try {
      setLoading(true);
      setPendingName(null);
      const response = await axios.post("/api/stores", { name: pendingName });
      window.location.assign(`/${response.data.id}`);
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  return (
    <Modal
      title="Crea una tienda"
      description="Agrega una nueva tienda para manejar productos y categorias"
      isOpen={storeModal.isOpen}
      onClose={storeModal.onClose}
    >
      <div>
        <div className="space-y-4 py-2 pb-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
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
              <div className="flex w-full items-center justify-end space-x-2 pt-6">
                <Button
                  disabled={loading}
                  variant="outline"
                  onClick={storeModal.onClose}
                >
                  Cancelar
                </Button>
                <Button disabled={loading} isLoading={loading} type="submit">
                  Continuar
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>

      <AlertDialog open={pendingName !== null} onOpenChange={(open) => !open && setPendingName(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Crear la tienda «{pendingName}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Nace vacía y aparte: no comparte productos, pedidos ni inventario con las
              tiendas que ya existen. Quedará registrada a tu nombre.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={loading}
              onClick={(event) => {
                event.preventDefault();
                void createStore();
              }}
            >
              Sí, crear la tienda
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Modal>
  );
}
