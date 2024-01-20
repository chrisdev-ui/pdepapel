"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  email: z.string().email("Ingresa un correo electrónico válido"),
});

type NewsletterFormValues = z.infer<typeof formSchema>;

const Newsletter: React.FC<{}> = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const form = useForm<NewsletterFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async (values: NewsletterFormValues) => {
    try {
      setLoading(true);
      toast({
        title: "¡Gracias por suscribirte!",
        description:
          "Te enviaremos un correo electrónico con más información pronto.",
        variant: "success",
      });
    } catch (error: any) {
      toast({
        title: "¡Ups! Algo salió mal.",
        description: "Por favor, inténtalo de nuevo más tarde.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  return (
    <Container className="mx-0 my-6 max-w-full p-0 sm:p-0 lg:p-0">
      <div className="flex w-full flex-wrap items-center justify-between gap-5 bg-pink-froly bg-[url('/images/pdp-signup.png')] bg-[20%_30%] bg-no-repeat px-2 py-10 sm:px-20 xl:gap-0">
        <div>
          <h4 className="font-serif text-3xl font-bold text-white">
            Suscríbete para recibir nuestras novedades
          </h4>
          <p className="font-serif text-sm font-semibold text-green-leaf">
            Recibe actualizaciones por correo electrónico sobre nuestra tienda y{" "}
            <span className="text-blue-yankees">ofertas especiales.</span>
          </p>
        </div>
        <div>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex w-full"
            >
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        disabled={loading}
                        className="h-10 w-full rounded rounded-br-none rounded-tr-none border border-solid border-transparent bg-white px-5 py-0 text-sm outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-transparent focus-visible:ring-offset-0 sm:w-80"
                        placeholder="Tu dirección de correo electrónico"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-blue-yankees" />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="h-10 whitespace-nowrap rounded rounded-bl-none rounded-tl-none border-none bg-blue-yankees px-10 py-5 text-sm font-semibold text-white outline-none ring-offset-transparent [transition:0.2s]"
              >
                ¡Regístrate!
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </Container>
  );
};

export default Newsletter;
