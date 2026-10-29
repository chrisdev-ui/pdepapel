import { checkoutOrder } from "@/actions/checkout-order";
import { createNewOrder } from "@/actions/create-new-order";
import { PaymentMethod } from "@/constants";
import { resolveCheckoutEndpoint } from "@/lib/presale-checkout";
import { CheckoutOrder, CheckoutResponse, Order } from "@/types";
import { useMutation } from "@tanstack/react-query";

export interface CheckoutSubmission {
  data: CheckoutOrder;
  /** Same key on every retry of this attempt; see lib/checkout-idempotency. */
  idempotencyKey?: string;
}

export default function useCheckout({
  onError,
  onMutate,
  onSettled,
  onSuccess,
  getToken,
}: {
  onError?: (err: Error, variables: CheckoutSubmission, context: unknown) => void;
  onSuccess?: (
    data: CheckoutResponse | Order,
    variables: CheckoutSubmission,
    context: unknown,
  ) => void;
  onSettled?: (
    data: CheckoutResponse | Order | undefined,
    error: Error | null,
    variables: CheckoutSubmission,
    context: unknown,
  ) => void;
  onMutate?: (variables: CheckoutSubmission) => void;
  getToken?: () => Promise<string | null>;
} = {}) {
  const mutationFn = async ({ data, idempotencyKey }: CheckoutSubmission) => {
    const sessionToken = await getToken?.();
    if (data.userId && !sessionToken) {
      throw new Error(
        "No pudimos validar tu sesión. Actualiza la página e inténtalo de nuevo.",
      );
    }

    switch (data.payment.method) {
      case PaymentMethod.BankTransfer:
      case PaymentMethod.COD:
      case PaymentMethod.Bold:
      case PaymentMethod.Wompi:
        // La transferencia de una preventa con anticipo también va a /checkout.
        return resolveCheckoutEndpoint(data) === "checkout"
          ? await checkoutOrder(data, sessionToken, idempotencyKey)
          : await createNewOrder(data, sessionToken, idempotencyKey);
      default:
        throw new Error("Método de pago no disponible");
    }
  };

  return useMutation({
    mutationFn,
    onError,
    onSuccess,
    onSettled,
    onMutate,
  });
}
