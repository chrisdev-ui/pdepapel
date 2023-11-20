"use client";

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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { Send } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

const formSchema = z.object({
  name: z
    .string()
    .min(
      1,
      "Parece que olvidaste escribir tu nombre. Necesitamos saber cómo dirigirnos a ti",
    )
    .max(
      50,
      "Oops, parece que tu nombre es muy largo. Por favor, ingresa un nombre más corto.",
    ),
  email: z
    .string()
    .min(
      1,
      "Olvidaste añadir tu correo electrónico. Lo necesitamos para ponernos en contacto contigo.",
    )
    .email(
      "¡Vaya! Esa dirección de correo no parece ser válida. ¿Puedes verificarla?",
    ),
  subject: z.string().optional(),
  message: z.string().optional(),
});

type ContactFormValue = z.infer<typeof formSchema>;

export const ContactForm: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<ContactFormValue>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      subject: "",
      message: "",
    },
  });

  const onSubmit = async (data: ContactFormValue) => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (response.status === 200 || response.status === 201) {
        form.reset();
        toast({
          title: "¡Gracias!",
          description:
            "Tu mensaje ha sido enviado. Nos pondremos en contacto contigo lo más pronto posible.",
          variant: "success",
          icon: <Send className="h-6 w-6" />,
        });
      } else {
        toast({
          title: "¡Ups!",
          description:
            "Algo salió mal. Por favor, inténtalo de nuevo más tarde.",
          variant: "destructive",
          icon: <Send className="h-6 w-6" />,
        });
      }
    } catch (error) {
      toast({
        title: "¡Ups!",
        description: "Algo salió mal. Por favor, inténtalo de nuevo más tarde.",
        variant: "destructive",
        icon: <Send className="h-6 w-6" />,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex w-full flex-col gap-5"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Nombre <span className="text-destructive">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  className="bg-green-leaf/20 invalid:bg-pink-froly/20"
                  disabled={isLoading}
                  placeholder="Escribe tu nombre"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Correo electrónico <span className="text-destructive">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  className="bg-green-leaf/20 invalid:bg-pink-froly/20"
                  disabled={isLoading}
                  placeholder="Escribe tu correo electrónico"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="subject"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Asunto</FormLabel>
              <FormControl>
                <Input
                  className="bg-green-leaf/20 invalid:bg-pink-froly/20"
                  disabled={isLoading}
                  placeholder="Escribe tu el asunto de tu mensaje"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mensaje</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Escribe tu mensaje"
                  className="resize-none bg-green-leaf/20 invalid:bg-pink-froly/20"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Deja tu mensaje y te responderemos lo más pronto posible.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isLoading}>
          Enviar <Send className="ml-2 h-4 w-4" />
        </Button>
      </form>
    </Form>
  );
};
