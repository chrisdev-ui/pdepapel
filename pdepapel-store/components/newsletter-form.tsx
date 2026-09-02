"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { trackCustomerEvent } from "@/lib/customer-analytics";
import { STOREFRONT_ROUTES } from "@/lib/routes";

const formSchema = z.object({
  email: z.string().email("Ingresa un correo electrónico válido"),
  consent: z.boolean().refine(Boolean, {
    message: "Autoriza el envío de novedades para continuar",
  }),
  company: z.string().max(0).optional(),
});

type NewsletterFormValues = z.infer<typeof formSchema>;

export function NewsletterForm() {
  const { toast } = useToast();
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const form = useForm<NewsletterFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      consent: false,
      company: "",
    },
  });

  const onSubmit = async (values: NewsletterFormValues) => {
    try {
      setLoading(true);
      setSuccessMessage(null);
      trackCustomerEvent("newsletter_signup_submitted", { source: pathname });
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, source: pathname }),
      });
      const result = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      if (!response.ok) {
        throw new Error(result?.message ?? "No pudimos iniciar la suscripción");
      }

      const message =
        result?.message ??
        "Si aún falta confirmar, recibirás un enlace por correo. Revisa también la carpeta de spam.";
      setSuccessMessage(message);
      form.reset();
      trackCustomerEvent("newsletter_confirmation_requested", {
        source: pathname,
      });
      toast({
        title: "Revisa tu correo",
        description: message,
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "¡Ups! Algo salió mal.",
        description:
          error instanceof Error
            ? error.message
            : "Por favor, inténtalo de nuevo más tarde.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="w-full space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-0">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="min-w-0 flex-1 space-y-1">
                <FormLabel className="sr-only">Correo electrónico</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    disabled={loading}
                    className="h-11 w-full rounded border border-solid border-transparent bg-white px-4 text-base sm:rounded-br-none sm:rounded-tr-none"
                    placeholder="tu@correo.com"
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-blue-yankees" />
              </FormItem>
            )}
          />
          <Button
            type="submit"
            disabled={loading}
            className="h-11 whitespace-nowrap rounded border-none bg-blue-yankees px-5 text-sm font-medium text-white outline-none ring-offset-transparent sm:rounded-bl-none sm:rounded-tl-none"
          >
            {loading ? "Enviando…" : "Quiero recibir novedades"}
          </Button>
        </div>

        <FormField
          control={form.control}
          name="consent"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <div className="flex items-start gap-2">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={loading}
                    className="mt-0.5 h-5 w-5 border-blue-yankees bg-white"
                  />
                </FormControl>
                <FormLabel className="text-xs font-medium leading-5 text-blue-yankees">
                  Autorizo hasta dos correos al mes con novedades, lanzamientos
                  y ofertas. Puedo cancelar cuando quiera. Consulta la{" "}
                  <Link
                    href={STOREFRONT_ROUTES.dataPolicy}
                    className="underline underline-offset-2"
                  >
                    política de datos
                  </Link>
                  .
                </FormLabel>
              </div>
              <FormMessage className="text-blue-yankees" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="company"
          render={({ field }) => (
            <FormItem className="absolute -left-[9999px]" aria-hidden="true">
              <FormLabel>Empresa</FormLabel>
              <FormControl>
                <Input tabIndex={-1} autoComplete="off" {...field} />
              </FormControl>
            </FormItem>
          )}
        />

        {successMessage ? (
          <p
            className="rounded-lg bg-white/75 px-3 py-2 text-sm font-medium text-blue-yankees"
            role="status"
            aria-live="polite"
          >
            {successMessage}
          </p>
        ) : null}
      </form>
    </Form>
  );
}
