import { checkoutOrder } from "@/actions/checkout-order";
import { createNewOrder } from "@/actions/create-new-order";
import { PaymentMethod } from "@/constants";
import { CheckoutByOrderResponse, CheckoutOrder, Order } from "@/types";
import { useMutation } from "@tanstack/react-query";

export default function useCheckout({
  onError,
  onMutate,
  onSettled,
  onSuccess,
}: {
  onError?: (err: Error, variables: CheckoutOrder, context: unknown) => void;
  onSuccess?: (
    data: CheckoutByOrderResponse | Order,
    variables: CheckoutOrder,
    context: unknown,
  ) => void;
  onSettled?: (
    data: CheckoutByOrderResponse | Order | undefined,
    error: Error | null,
    variables: CheckoutOrder,
    context: unknown,
  ) => void;
  onMutate?: (variables: CheckoutOrder) => void;
} = {}) {
  const mutationFn = async (formData: CheckoutOrder) => {
    switch (formData.payment.method) {
      case PaymentMethod.BankTransfer:
      case PaymentMethod.COD:
        return await createNewOrder(formData);
      case PaymentMethod.Wompi:
      case PaymentMethod.PayU:
        return await checkoutOrder(formData);
      default:
        throw new Error("Invalid payment method");
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
