import { Checkbox } from "@/components/ui/checkbox";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { useAuth } from "@clerk/nextjs";
import { Lock, UserRound } from "lucide-react";
import Link from "next/link";
import { UseFormReturn } from "react-hook-form";
import { CheckoutFormValue } from "../multi-step-checkout-form";

interface BasicInfoStepProps {
  form: UseFormReturn<CheckoutFormValue>;
  isLoading?: boolean;
}

export const BasicInfoStep = ({ form, isLoading }: BasicInfoStepProps) => {
  const { isLoaded, userId } = useAuth();
  const showSignInHint = isLoaded && !userId;

  return (
    <div className="space-y-6 duration-500 animate-in fade-in-0 slide-in-from-right-4">
      <div className="space-y-1">
        <h2 className="font-serif text-2xl font-bold text-blue-yankees sm:text-3xl">
          Tus datos
        </h2>
        <p className="text-sm text-muted-foreground">
          Solo lo necesario para contactarte y generar la guía de envío.
        </p>
      </div>

      {showSignInHint && (
        <p className="flex items-center gap-3 rounded-xl border border-blue-baby bg-blue-purple/10 p-3 text-sm text-blue-yankees">
          <UserRound className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>
            ¿Ya tienes cuenta?{" "}
            <Link
              href={`${STOREFRONT_ROUTES.signIn}?redirect_url=${encodeURIComponent(STOREFRONT_ROUTES.checkout)}`}
              className="font-semibold underline underline-offset-4"
            >
              Inicia sesión
            </Link>{" "}
            y completamos tus datos y direcciones. También puedes comprar como
            invitada.
          </span>
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground/90">
                Nombre y apellidos *
              </FormLabel>
              <FormControl>
                <Input
                  className="bg-blue-purple/20 invalid:bg-pink-froly/20"
                  disabled={isLoading}
                  autoComplete="name"
                  placeholder="Ej. Ana María Torres"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Como aparece en tu documento, para la transportadora.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground/90">
                Correo electrónico *
              </FormLabel>
              <FormControl>
                <Input
                  className="bg-blue-purple/20 invalid:bg-pink-froly/20"
                  disabled={isLoading}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="Ej. ana@correo.com"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Aquí te enviamos la confirmación y el seguimiento.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="telephone"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground/90">
                Teléfono / WhatsApp *
              </FormLabel>
              <FormControl>
                <PhoneInput
                  disabled={isLoading}
                  autoComplete="tel"
                  placeholder="Ej. 300 123 4567"
                  international={false}
                  defaultCountry="CO"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Te escribimos solo si hay novedades con tu pedido.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="documentId"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground/90">
                Documento de identidad *
              </FormLabel>
              <FormControl>
                <Input
                  className="bg-blue-purple/20 invalid:bg-pink-froly/20"
                  disabled={isLoading}
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Ej. 1234567890"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Lo pide la transportadora para entregar el paquete.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="newsletterOptIn"
        render={({ field }) => (
          <FormItem className="flex items-start gap-2.5 space-y-0">
            <FormControl>
              <Checkbox
                checked={field.value}
                onCheckedChange={field.onChange}
                disabled={isLoading}
                className="mt-0.5 h-5 w-5 border-blue-yankees bg-white"
              />
            </FormControl>
            <FormLabel className="text-xs font-medium leading-5 text-foreground/80">
              Quiero enterarme de lo nuevo por correo (máximo dos correos al
              mes; puedo cancelar cuando quiera).
            </FormLabel>
          </FormItem>
        )}
      />

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5 text-success" aria-hidden="true" />
        Tus datos solo se usan para este pedido.
      </p>
    </div>
  );
};
