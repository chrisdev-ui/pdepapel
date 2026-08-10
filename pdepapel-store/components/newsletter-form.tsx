"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Button } from "@/components/ui/button";
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

export function NewsletterForm() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const form = useForm<NewsletterFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async () => {
    try {
      setLoading(true);
      toast({
        title: "¡Gracias por suscribirte!",
        description:
          "Te enviaremos un correo electrónico con más información pronto.",
        variant: "success",
      });
    } catch {
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
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex w-full">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem className="min-w-0 flex-1">
              <FormControl>
                <Input
                  disabled={loading}
                  className="h-10 w-full rounded rounded-br-none rounded-tr-none border border-solid border-transparent bg-white px-5 py-0 text-sm outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-transparent focus-visible:ring-offset-0 focus-visible:ring-offset-0"
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
  );
}
