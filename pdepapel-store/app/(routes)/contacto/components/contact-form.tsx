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
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Send, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

export const CONTACT_SUBJECTS = [
  "Mi pedido",
  "Un producto",
  "Envíos",
  "Cotización",
  "Solo saludar",
] as const;

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
  mobile: z.string().optional(),
});

type ContactFormValue = z.infer<typeof formSchema>;

const inputClassName = "bg-blue-purple/20 invalid:bg-pink-froly/20";

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
      mobile: "",
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
        className="flex w-full flex-col gap-6"
      >
        <div className="grid gap-4 sm:grid-cols-2">
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
                    className={inputClassName}
                    disabled={isLoading}
                    autoComplete="name"
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
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    className={inputClassName}
                    disabled={isLoading}
                    placeholder="Escribe tu correo electrónico"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        {/* Honeypot field - hidden from users but visible to bots */}
        <FormField
          control={form.control}
          name="mobile"
          render={({ field }) => (
            <FormItem className="absolute -z-10 opacity-0">
              <FormLabel>Mobile</FormLabel>
              <FormControl>
                <Input
                  autoComplete="off"
                  tabIndex={-1}
                  placeholder="Mobile number"
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
                <div
                  role="radiogroup"
                  aria-label="Asunto"
                  className="flex flex-wrap gap-2"
                >
                  {CONTACT_SUBJECTS.map((subject) => {
                    const selected = field.value === subject;

                    return (
                      <button
                        key={subject}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={isLoading}
                        onClick={() => field.onChange(selected ? "" : subject)}
                        className={cn(
                          "inline-flex h-11 touch-manipulation items-center gap-1.5 rounded-full border border-input bg-background px-4 text-sm font-medium transition-colors hover:border-kawaii-pink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                          selected && "border-kawaii-pink bg-kawaii-pink-light",
                        )}
                      >
                        {selected && (
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {subject}
                      </button>
                    );
                  })}
                </div>
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
                  className={cn("min-h-[140px] resize-none", inputClassName)}
                  disabled={isLoading}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Si es sobre un pedido, incluye el número de orden y te ayudamos
                más rápido.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="submit"
            variant="kawaii"
            disabled={isLoading}
            className="px-8 text-blue-yankees"
          >
            {isLoading ? "Enviando…" : "Enviar mensaje"}
            <Send className="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Al enviar aceptas la{" "}
              <Link
                href={STOREFRONT_ROUTES.dataPolicy}
                className="underline underline-offset-2 hover:text-pink-froly"
              >
                política de tratamiento de datos
              </Link>
              .
            </span>
          </p>
        </div>
      </form>
    </Form>
  );
};
