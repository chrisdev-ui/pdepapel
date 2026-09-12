"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { detailsTitleOptions, paymentMethodsByOption } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { getAdminOrderPaymentOptions } from "@/lib/order-payment-options";
import { ORDER_STATUS_LABELS, isPaidLike } from "@/lib/order-transitions";
import {
  OrderStatus,
  PaymentMethod,
  ShippingProvider,
  type OrderType,
} from "@prisma/client";
import axios from "axios";
import { Copy, CreditCard, Link2, Loader2, Smartphone } from "lucide-react";
import { useMemo, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import type { GetOrderResult } from "../../server/get-order";
import { PaymentStatusWatcher } from "./payment-status-watcher";
import { parseOrderDetails, type OrderFormValues } from "./schema";
import { SectionCard } from "./section-card";
import { StatusActions, type TransitionPayload } from "./status-actions";

interface PaymentCardProps {
  storeId: string;
  initialData: GetOrderResult["order"];
  type: OrderType;
  loading: boolean;
  isDirty: boolean;
  showMethod: boolean;
  onTransition: (payload: TransitionPayload) => Promise<void>;
}

const STORE_URL =
  process.env.NEXT_PUBLIC_FRONTEND_STORE_URL || "https://papeleriapdepapel.com";

/**
 * Pago en una sola tarjeta: método, referencia, lo que confirmó la pasarela y
 * las acciones de estado. Los enlaces y el datáfono viven aquí porque son
 * formas de cobrar, no «links» sueltos.
 */
export function PaymentCard({
  storeId,
  initialData,
  type,
  loading,
  isDirty,
  showMethod,
  onTransition,
}: PaymentCardProps) {
  const form = useFormContext<OrderFormValues>();
  const { toast } = useToast();
  const [copyingWompi, setCopyingWompi] = useState(false);
  const [pushingBold, setPushingBold] = useState(false);

  const method = useWatch({ control: form.control, name: "payment.method" });
  const transactionId = useWatch({
    control: form.control,
    name: "payment.transactionId",
  });
  const shippingProvider = useWatch({
    control: form.control,
    name: "shippingProvider",
  });
  const trackingCode = useWatch({
    control: form.control,
    name: "shipping.trackingCode",
  });
  const rateId = useWatch({ control: form.control, name: "envioClickIdRate" });
  const carrierName = useWatch({
    control: form.control,
    name: "shipping.carrierName",
  });
  const shippingCost = useWatch({
    control: form.control,
    name: "shipping.cost",
  });
  const guideRate =
    shippingProvider === ShippingProvider.ENVIOCLICK &&
    rateId &&
    !initialData?.shipping?.envioClickIdOrder
      ? {
          carrier: carrierName || "transportadora",
          cost: Number(shippingCost ?? 0),
        }
      : null;

  const status = initialData?.status ?? form.getValues("status");
  const locked = Boolean(initialData && isPaidLike(initialData.status));
  const savedMethod = initialData?.payment?.method ?? null;
  const options = useMemo(() => getAdminOrderPaymentOptions(method), [method]);
  const parsedDetails = useMemo(
    () => parseOrderDetails(initialData?.payment?.details),
    [initialData?.payment?.details],
  );
  const methodPendingSave = Boolean(initialData) && method !== savedMethod;

  const copy = (value: string, description: string) => {
    navigator.clipboard.writeText(value);
    toast({ description, variant: "success" });
  };

  const copyWompiLink = async () => {
    if (!initialData) return;
    try {
      setCopyingWompi(true);
      const response = await axios.post(
        `/api/${storeId}/checkout/${initialData.id}`,
      );
      if (!response.data?.url)
        throw new Error("No se pudo generar el enlace de pago");
      copy(response.data.url, "Enlace de pago Wompi copiado");
    } catch (error) {
      toast({ description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setCopyingWompi(false);
    }
  };

  const pushBold = async () => {
    if (!initialData) return;
    try {
      setPushingBold(true);
      await axios.post(`/api/${storeId}/bold/terminal/${initialData.id}`);
      toast({
        title: "Cobro enviado al datáfono",
        description:
          "Esto solo avisa al equipo. El pedido quedará pagado cuando Bold confirme el cobro; esta página lo revisa sola. Si la pantalla del datáfono está ocupada, pulsa Cancelar (X) para liberar la cola.",
      });
    } catch (error) {
      toast({
        title: "El datáfono no recibió el cobro",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setPushingBold(false);
    }
  };

  const onlineSaved =
    savedMethod === PaymentMethod.Bold || savedMethod === PaymentMethod.Wompi;
  const canCharge =
    Boolean(initialData) && !locked && status !== OrderStatus.CANCELLED;

  return (
    <SectionCard
      id="pago"
      title="Pago"
      description={
        initialData
          ? `Estado: ${ORDER_STATUS_LABELS[status]}${initialData.paidAt ? " · fecha de pago registrada" : ""}`
          : "Cómo va a pagar el cliente."
      }
    >
      {initialData && (
        <PaymentStatusWatcher
          storeId={storeId}
          orderId={initialData.id}
          status={initialData.status}
          paymentMethod={savedMethod}
          isDirty={isDirty}
        />
      )}

      {showMethod && (
        <div className="grid grid-cols-1 gap-4">
          <FormField
            control={form.control}
            name="payment.method"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Método de pago</FormLabel>
                <Select
                  disabled={loading || locked}
                  onValueChange={(val) => {
                    field.onChange(val);
                    form.setValue("shipping.isCOD", val === PaymentMethod.COD, {
                      shouldDirty: true,
                    });
                  }}
                  value={field.value}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Elige cómo paga" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {locked ? (
                  <FormDescription>
                    El método no cambia después de cobrar.
                  </FormDescription>
                ) : method === PaymentMethod.Bold ? (
                  <FormDescription>
                    Bold confirma el pago por webhook; nunca lo marques pagado a
                    mano.
                  </FormDescription>
                ) : method === PaymentMethod.BankTransfer ? (
                  <FormDescription>
                    Cuando llegue el comprobante, usa «Marcar como pagado» con
                    la referencia.
                  </FormDescription>
                ) : null}
                <FormMessage />
              </FormItem>
            )}
          />
          {(transactionId ||
            (!locked &&
              method &&
              method !== PaymentMethod.Bold &&
              method !== PaymentMethod.Wompi)) && (
            <FormField
              control={form.control}
              name="payment.transactionId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Referencia del pago</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading || locked}
                      placeholder="Número del comprobante"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
      )}

      {initialData?.payment?.details &&
        Object.keys(parsedDetails).length > 0 && (
          <Alert>
            <AlertDescription>
              <dl className="flex flex-col gap-1 text-sm">
                {Object.entries(parsedDetails).map(([key, value]) => {
                  const labels = paymentMethodsByOption[
                    initialData.payment?.method as PaymentMethod
                  ] as Record<string, string> | undefined;
                  return (
                    <div key={key} className="flex flex-col">
                      <dt className="font-semibold">
                        {detailsTitleOptions[key] || key}
                      </dt>
                      <dd>{labels?.[String(value)] || String(value)}</dd>
                    </div>
                  );
                })}
              </dl>
            </AlertDescription>
          </Alert>
        )}

      {initialData && (
        <div className="flex flex-col gap-2">
          <StatusActions
            status={initialData.status}
            type={type}
            paymentMethod={savedMethod}
            shippingProvider={shippingProvider ?? ShippingProvider.NONE}
            trackingCode={trackingCode}
            transactionId={transactionId}
            guideRate={guideRate}
            loading={loading}
            variant="card"
            onTransition={onTransition}
          />
          {methodPendingSave && !locked && (
            <p className="text-xs text-muted-foreground">
              Guarda el pedido para que el nuevo método aplique a los cobros.
            </p>
          )}
        </div>
      )}

      {canCharge && (
        <div className="flex flex-col gap-2 border-t pt-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cobrar
          </span>
          {savedMethod === PaymentMethod.Bold && (
            <>
              <Button
                type="button"
                variant="soft"
                size="sm"
                className="justify-start"
                disabled={pushingBold}
                onClick={pushBold}
              >
                {pushingBold ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Smartphone className="h-4 w-4" aria-hidden="true" />
                )}
                Cobrar en el datáfono
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-start"
                onClick={() =>
                  copy(
                    `${STORE_URL}/pedido/${initialData!.id}?autoPay=true`,
                    "Enlace de pago copiado",
                  )
                }
              >
                <Link2 className="h-4 w-4" aria-hidden="true" />
                Copiar enlace de pago
              </Button>
            </>
          )}
          {(savedMethod === PaymentMethod.Wompi || !savedMethod) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-start"
              disabled={copyingWompi}
              onClick={copyWompiLink}
            >
              {copyingWompi ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <CreditCard className="h-4 w-4" aria-hidden="true" />
              )}
              Copiar enlace de pago Wompi
            </Button>
          )}
          {!onlineSaved && savedMethod && (
            <p className="text-xs text-muted-foreground">
              Los enlaces y el datáfono solo aplican con «Pago en línea». Cambia
              el método y guarda para usarlos.
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={() =>
              copy(
                `${STORE_URL}/pedido/${initialData!.id}`,
                "Enlace del pedido copiado",
              )
            }
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copiar enlace del pedido
          </Button>
        </div>
      )}
    </SectionCard>
  );
}
