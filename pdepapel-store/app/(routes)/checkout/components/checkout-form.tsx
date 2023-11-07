"use client";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { User } from "@clerk/nextjs/server";
import { zodResolver } from "@hookform/resolvers/zod";

import { useForm } from "react-hook-form";
import * as z from "zod";

const formSchema = z.object({
  firstName: z.string().min(1, "Por favor, escribe tu nombre").max(20),
  lastName: z.string().min(1, "Por favor, escribe tu apellido").max(20),
  telephone: z.string().min(10, "Por favor, escribe tu teléfono").max(14),
  address1: z.string().min(1, "Por favor, escribe tu dirección").max(50),
  address2: z.string().max(50).optional(),
  city: z.string().min(1, "Por favor, escribe tu ciudad").max(50),
  state: z.string().min(1, "Por favor, escribe tu departamento").max(30),
});

type CheckoutFormValue = z.infer<typeof formSchema>;

interface CheckoutFormProps {
  currentUser?: User;
}

export const CheckoutForm: React.FC<CheckoutFormProps> = ({ currentUser }) => {
  const form = useForm<CheckoutFormValue>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: currentUser?.firstName ?? "",
      lastName: currentUser?.lastName ?? "",
      telephone: currentUser?.phoneNumbers[0].phoneNumber ?? "",
      address1: "",
      address2: "",
      city: "",
      state: "",
    },
  });

  const onSubmit = async (data: CheckoutFormValue) => {
    console.log(data);
  };

  return (
    <div className="mt-12 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
      <div className="rounded-md border p-5 lg:col-span-8">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="w-full space-y-6"
          >
            <h2 className="font-serif text-lg font-bold">
              Información para tu envío
            </h2>
            <Separator />
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input
                        className="bg-green-leaf/20 invalid:bg-pink-froly/20"
                        placeholder="Maria"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Apellido</FormLabel>
                    <FormControl>
                      <Input
                        className="bg-green-leaf/20 invalid:bg-pink-froly/20"
                        placeholder="Dolores"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="telephone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono</FormLabel>
                    <FormControl>
                      <Input
                        className="bg-green-leaf/20 invalid:bg-pink-froly/20"
                        placeholder="3XXXXXXXXX"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="address1"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dirección</FormLabel>
                    <FormControl>
                      <Input
                        className="bg-green-leaf/20 invalid:bg-pink-froly/20"
                        placeholder="Calle 1 # 2 - 3"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="address2"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dirección 2</FormLabel>
                    <FormControl>
                      <Input
                        className="bg-green-leaf/20 invalid:bg-pink-froly/20"
                        placeholder="Edificio, Apto, Casa, Lote, etc. (Opcional)"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ciudad</FormLabel>
                    <FormControl>
                      <Input
                        className="bg-green-leaf/20 invalid:bg-pink-froly/20"
                        placeholder="ex: Medellín"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Departamento</FormLabel>
                    <FormControl>
                      <Input
                        className="bg-green-leaf/20 invalid:bg-pink-froly/20"
                        placeholder="ex: Antioquia"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>
      </div>
      <div className="rounded-md border p-5 lg:col-span-4">2</div>
    </div>
  );
};
