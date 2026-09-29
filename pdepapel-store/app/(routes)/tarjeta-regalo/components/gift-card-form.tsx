"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@clerk/nextjs";
import { useMutation } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { isValidPhoneNumber } from "react-phone-number-input";
import { z } from "zod";

import { checkoutGiftCard } from "@/actions/gift-cards";
import { Button } from "@/components/ui/button";
import { Currency } from "@/components/ui/currency";
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
import { PaymentMethodSelector } from "@/components/ui/payment-method-selector";
import { PhoneInput } from "@/components/ui/phone-input";
import { Textarea } from "@/components/ui/textarea";
import { PaymentMethod } from "@/constants";
import { useCheckoutStore } from "@/hooks/use-checkout-store";
import { useGuestUser } from "@/hooks/use-guest-user";
import { useToast } from "@/hooks/use-toast";
import { createIdempotencyKey } from "@/lib/checkout-idempotency";
import { orderPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { CheckoutResponse, GiftCardPurchase } from "@/types";

const GIFT_MESSAGE_MAX = 300;

const schema = z
  .object({
    amount: z.number().int().positive("Elige un valor"),
    buyerName: z.string().trim().min(3, "Escribe tu nombre y apellidos").max(100, "El nombre debe tener menos de 100 caracteres"),
    buyerEmail: z.string().trim().email("Escribe un correo válido, por ejemplo ana@gmail.com").max(60, "El correo debe tener menos de 60 caracteres"),
    buyerPhone: z.string().optional().or(z.literal("")),
    recipientName: z.string().trim().max(100, "El nombre debe tener menos de 100 caracteres").optional().or(z.literal("")),
    recipientEmail: z.string().trim().max(60, "El correo debe tener menos de 60 caracteres").optional().or(z.literal("")),
    message: z.string().trim().max(GIFT_MESSAGE_MAX, `El mensaje debe tener menos de ${GIFT_MESSAGE_MAX} caracteres`).optional().or(z.literal("")),
    paymentMethod: z.nativeEnum(PaymentMethod).default(PaymentMethod.Bold),
  })
  .superRefine((data, ctx) => {
    const email = (data.recipientEmail ?? "").trim();
    if (email && !z.string().email().safeParse(email).success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Escribe un correo válido, por ejemplo ana@gmail.com", path: ["recipientEmail"] });
    }
    if (email && !(data.recipientName ?? "").trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Escribe el nombre de quien la recibe", path: ["recipientName"] });
    }
    const phone = (data.buyerPhone ?? "").trim();
    if (phone && !isValidPhoneNumber(phone)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Escribe un celular válido, por ejemplo 300 123 4567", path: ["buyerPhone"] });
    }
  });

type GiftCardFormValue = z.infer<typeof schema>;

const generateGuestId = () => `guest_${Math.random().toString(36).slice(2, 11)}`;

/**
 * Compra de una tarjeta de regalo: valor, quién la recibe, tus datos y el
 * pago. Termina como el checkout: Bold abre el pago en la página del
 * pedido, Wompi redirige, la transferencia muestra las instrucciones.
 */
export function GiftCardForm({ denominations }: { denominations: number[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const { userId, getToken } = useAuth();
  const { guestId, setGuestId } = useGuestUser();
  const setPendingOrder = useCheckoutStore((state) => state.setPendingOrder);
  const idempotencyKeyRef = useRef(createIdempotencyKey());
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<GiftCardFormValue>({
    mode: "onTouched",
    resolver: zodResolver(schema),
    defaultValues: {
      amount: denominations[1] ?? denominations[0] ?? 0,
      buyerName: "",
      buyerEmail: "",
      buyerPhone: "",
      recipientName: "",
      recipientEmail: "",
      message: "",
      paymentMethod: PaymentMethod.Bold,
    },
  });
  const amount = form.watch("amount");
  const message = form.watch("message") ?? "";
  const recipientName = form.watch("recipientName") ?? "";
  const recipientEmail = form.watch("recipientEmail") ?? "";

  const deliveryHint = useMemo(() => {
    if (recipientEmail.trim()) return `El código llega al correo de ${recipientName.trim() || "quien la recibe"}.`;
    return "Sin correo de quien la recibe, el código llega a tu correo para que lo entregues tú.";
  }, [recipientEmail, recipientName]);

  const { mutateAsync, isPending } = useMutation({
    mutationFn: async (data: GiftCardPurchase) => checkoutGiftCard(data, await getToken(), idempotencyKeyRef.current),
    onSuccess(data: CheckoutResponse) {
      setSubmitted(true);
      if ("url" in data) {
        window.location.href = data.url;
        return;
      }
      const order = "boldData" in data ? data.order : data;
      setPendingOrder({ id: order.id, orderNumber: order.orderNumber || order.id, total: Number(order.total), createdAt: Date.now() });
      toast({
        title: "boldData" in data ? "Pedido creado, falta el pago" : "Pedido creado",
        description:
          "boldData" in data
            ? "Te llevamos al pago seguro. La tarjeta sale por correo en cuanto se confirme."
            : "Sigue las instrucciones de la transferencia. La tarjeta sale por correo cuando confirmemos el pago.",
        variant: "success",
      });
      router.push("boldData" in data ? `${orderPath(order.id)}?autoPay=true` : orderPath(order.id));
    },
    onError(error) {
      setSubmitted(false);
      idempotencyKeyRef.current = createIdempotencyKey();
      const data = isAxiosError(error) ? (error.response?.data as { error?: string; message?: string } | undefined) : undefined;
      toast({
        title: "No pudimos crear la compra",
        description: data?.error || data?.message || "Inténtalo de nuevo en un momento.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: GiftCardFormValue) => {
    let guest = guestId;
    if (!userId && !guest) {
      guest = generateGuestId();
      setGuestId(guest);
    }
    await mutateAsync({
      amount: data.amount,
      buyerName: data.buyerName.trim(),
      buyerEmail: data.buyerEmail.trim(),
      buyerPhone: data.buyerPhone || undefined,
      recipientName: data.recipientName?.trim() || undefined,
      recipientEmail: data.recipientEmail?.trim() || undefined,
      message: data.message?.trim() || undefined,
      payment: { method: data.paymentMethod },
      userId: userId ?? null,
      guestId: userId ? null : guest,
    }).catch(() => undefined);
  };

  const busy = isPending || submitted;

  return (
    <Form {...form}>
      <form
        id="gift-card-form"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-8 rounded-3xl border border-pink-shell/30 bg-white p-5 shadow-[0_4px_20px_hsl(280_30%_70%/0.15)] sm:p-8"
      >
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="font-serif text-2xl font-bold text-blue-yankees">¿De cuánto?</h2>
            <p className="text-sm text-muted-foreground">Se usa entera o por partes; lo que sobra queda para la próxima compra.</p>
          </div>
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <div role="radiogroup" aria-label="Valor de la tarjeta" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {denominations.map((value) => {
                      const selected = field.value === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={busy}
                          onClick={() => field.onChange(value)}
                          className={cn(
                            "flex h-16 items-center justify-center rounded-2xl border-[1.5px] font-quicksand text-lg font-black transition-colors",
                            selected
                              ? "border-pink-froly bg-pink-froly/10 text-pink-froly"
                              : "border-blue-baby bg-blue-purple/10 text-blue-yankees hover:border-pink-shell",
                          )}
                        >
                          <Currency value={value} className="text-lg font-black" />
                        </button>
                      );
                    })}
                  </div>
                </FormControl>
                <FormMessage reserveSpace />
              </FormItem>
            )}
          />
        </section>

        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="font-serif text-2xl font-bold text-blue-yankees">¿Para quién?</h2>
            <p className="text-sm text-muted-foreground">Opcional. {deliveryHint}</p>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="recipientName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground/90">Nombre de quien la recibe</FormLabel>
                  <FormControl>
                    <Input className="bg-blue-purple/20 invalid:bg-pink-froly/20" disabled={busy} autoComplete="off" placeholder="Ej. Mariana López" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage reserveSpace />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="recipientEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground/90">Su correo</FormLabel>
                  <FormControl>
                    <Input className="bg-blue-purple/20 invalid:bg-pink-froly/20" disabled={busy} type="email" inputMode="email" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="Ej. mariana@correo.com" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormDescription>Ahí llega el código.</FormDescription>
                  <FormMessage reserveSpace />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel className="text-foreground/90">Mensaje</FormLabel>
                  <FormControl>
                    <Textarea className="bg-blue-purple/20" disabled={busy} rows={3} maxLength={GIFT_MESSAGE_MAX} placeholder="Ej. ¡Feliz cumpleaños! Para que llenes estas hojas de ideas bonitas." {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormDescription>
                    Va en el correo con el código. {message.length}/{GIFT_MESSAGE_MAX}
                  </FormDescription>
                  <FormMessage reserveSpace />
                </FormItem>
              )}
            />
          </div>
        </section>

        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="font-serif text-2xl font-bold text-blue-yankees">Tus datos</h2>
            <p className="text-sm text-muted-foreground">Para el recibo y por si hay que escribirte.</p>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="buyerName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground/90">Nombre y apellidos *</FormLabel>
                  <FormControl>
                    <Input className="bg-blue-purple/20 invalid:bg-pink-froly/20" disabled={busy} autoComplete="name" placeholder="Ej. Ana María Torres" {...field} />
                  </FormControl>
                  <FormMessage reserveSpace />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="buyerEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground/90">Correo electrónico *</FormLabel>
                  <FormControl>
                    <Input className="bg-blue-purple/20 invalid:bg-pink-froly/20" disabled={busy} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="Ej. ana@correo.com" {...field} />
                  </FormControl>
                  <FormDescription>Aquí te enviamos el recibo.</FormDescription>
                  <FormMessage reserveSpace />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="buyerPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground/90">Teléfono / WhatsApp</FormLabel>
                  <FormControl>
                    <PhoneInput disabled={busy} autoComplete="tel" placeholder="Ej. 300 123 4567" international={false} defaultCountry="CO" value={field.value ?? ""} onChange={field.onChange} />
                  </FormControl>
                  <FormDescription>Opcional. Solo si hay novedades con tu compra.</FormDescription>
                  <FormMessage reserveSpace />
                </FormItem>
              )}
            />
          </div>
        </section>

        <section className="space-y-4">
          <div className="space-y-1">
            <h2 id="gift-card-payment" className="font-serif text-2xl font-bold text-blue-yankees">Pago</h2>
            <p className="text-sm text-muted-foreground">En línea o por transferencia. No hay envío: la tarjeta sale por correo en cuanto el pago se confirme.</p>
          </div>
          <FormField
            control={form.control}
            name="paymentMethod"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <PaymentMethodSelector value={field.value} onChange={field.onChange} disabled={busy} hide={[PaymentMethod.COD]} ariaLabelledBy="gift-card-payment" />
                </FormControl>
                <FormMessage reserveSpace />
              </FormItem>
            )}
          />
        </section>

        <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5 text-success" aria-hidden="true" />
            Pago seguro. Tus datos solo se usan para esta compra.
          </p>
          <Button type="submit" variant="kawaii" disabled={busy || !amount} className="px-8 text-blue-yankees">
            {busy ? "Creando la compra…" : (
              <>
                Comprar tarjeta de <Currency value={amount} className="ml-1 text-base font-black" />
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
