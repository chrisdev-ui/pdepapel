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
import { Textarea } from "@/components/ui/textarea";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { currencyFormatter } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";
import { Gift, Lock, Truck, UserRound } from "lucide-react";
import { UseFormReturn, useWatch } from "react-hook-form";
import { CheckoutFormValue } from "../multi-step-checkout-form";
import { StorefrontLink } from "@/components/storefront-link";

const GIFT_MESSAGE_MAX = 300;

interface BasicInfoStepProps {
  form: UseFormReturn<CheckoutFormValue>;
  isLoading?: boolean;
  /** Server's answer, used until Clerk loads so the hint does not pop in late. */
  isGuest?: boolean;
  /** Umbral de envío gratis de Configuración (COP); null = no hay. */
  freeShippingThreshold?: number | null;
  /** El pedido ya alcanza el envío gratis. */
  freeShipping?: boolean;
}

/** Lo primero que se pregunta quien entra al checkout: cuánto cuesta el envío. */
export function shippingTeaser(threshold: number | null | undefined, freeShipping: boolean): string {
  if (freeShipping) return "Tu envío es gratis.";
  if (threshold && threshold > 0) {
    return `Envío gratis desde ${currencyFormatter.format(threshold)} · el valor exacto en el siguiente paso`;
  }
  return "El valor del envío, en el siguiente paso.";
}

export const BasicInfoStep = ({
  form,
  isLoading,
  isGuest = true,
  freeShippingThreshold = null,
  freeShipping = false,
}: BasicInfoStepProps) => {
  const { isLoaded, userId } = useAuth();
  const showSignInHint = isLoaded ? !userId : isGuest;
  const isGift = useWatch({ control: form.control, name: "isGift" });
  const giftMessage = useWatch({ control: form.control, name: "giftMessage" });

  return (
    <div className="space-y-5 duration-500 animate-in fade-in-0 slide-in-from-right-4 sm:space-y-6">
      <div className="space-y-1">
        <h2 className="font-serif text-2xl font-bold text-blue-yankees sm:text-3xl">
          Tus datos
        </h2>
        <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="checkout-shipping-teaser">
          <Truck className="h-4 w-4 shrink-0 text-blue-yankees" aria-hidden="true" />
          {shippingTeaser(freeShippingThreshold, freeShipping)}
        </p>
      </div>

      {showSignInHint && (
        <p className="flex items-center gap-2 rounded-xl border border-blue-baby bg-blue-purple/10 px-3 py-2 text-sm text-blue-yankees">
          <UserRound className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            ¿Tienes cuenta?{" "}
            <StorefrontLink
              href={`${STOREFRONT_ROUTES.signIn}?redirect_url=${encodeURIComponent(STOREFRONT_ROUTES.checkout)}`}
              className="font-semibold underline underline-offset-4"
            >
              Inicia sesión
            </StorefrontLink>{" "}
            y llenamos tus datos.
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
              <FormMessage reserveSpace />
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
              <FormMessage reserveSpace />
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
              <FormMessage reserveSpace />
            </FormItem>
          )}
        />
      </div>

      <section
        aria-labelledby="regalo-titulo"
        className="rounded-2xl border border-pink-shell/40 bg-pink-froly/10 p-4"
      >
        <FormField
          control={form.control}
          name="isGift"
          render={({ field }) => (
            <FormItem className="flex items-start gap-3 space-y-0">
              <FormControl>
                <Checkbox
                  id="es-regalo"
                  checked={Boolean(field.value)}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                  disabled={isLoading}
                  className="mt-0.5 h-5 w-5 border-blue-yankees bg-white"
                />
              </FormControl>
              <div className="space-y-1">
                <FormLabel
                  htmlFor="es-regalo"
                  id="regalo-titulo"
                  className="flex items-center gap-2 font-sans text-base font-semibold text-blue-yankees"
                >
                  <Gift className="h-4 w-4" aria-hidden="true" />
                  ¿Es un regalo?
                </FormLabel>
                <FormDescription>
                  Tú recibes el recibo completo en tu correo; a esa persona le
                  llega un aviso sin productos ni precios cuando el pedido esté
                  pagado, y la guía sale a su nombre.
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        {isGift && (
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="giftRecipientName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground/90">
                    Nombre de quien recibe *
                  </FormLabel>
                  <FormControl>
                    <Input
                      className="bg-white invalid:bg-pink-froly/20"
                      disabled={isLoading}
                      autoComplete="off"
                      placeholder="Ej. Mariana López"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormDescription>
                    Así sale en la guía de envío.
                  </FormDescription>
                  <FormMessage reserveSpace />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="giftRecipientEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground/90">
                    Su correo (opcional)
                  </FormLabel>
                  <FormControl>
                    <Input
                      className="bg-white invalid:bg-pink-froly/20"
                      disabled={isLoading}
                      type="email"
                      inputMode="email"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="Ej. mariana@correo.com"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormDescription>
                    Solo recibe el aviso del regalo y el seguimiento, sin
                    precios.
                  </FormDescription>
                  <FormMessage reserveSpace />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="giftRecipientPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground/90">
                    Su celular (opcional)
                  </FormLabel>
                  <FormControl>
                    <PhoneInput
                      disabled={isLoading}
                      autoComplete="off"
                      placeholder="Ej. 300 123 4567"
                      international={false}
                      defaultCountry="CO"
                      value={field.value ?? ""}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormDescription>
                    Para que la transportadora pueda llamarle. Si no, usamos
                    el tuyo.
                  </FormDescription>
                  <FormMessage reserveSpace />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="giftMessage"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel className="text-foreground/90">
                    Mensaje para esa persona (opcional)
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      className="bg-white"
                      disabled={isLoading}
                      rows={3}
                      maxLength={GIFT_MESSAGE_MAX}
                      placeholder="Ej. ¡Feliz cumpleaños! Para que llenes estas hojas de ideas bonitas."
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormDescription>
                    Va en el aviso que le llega por correo.{" "}
                    {(giftMessage ?? "").length}/{GIFT_MESSAGE_MAX}
                  </FormDescription>
                  <FormMessage reserveSpace />
                </FormItem>
              )}
            />
          </div>
        )}
      </section>

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
