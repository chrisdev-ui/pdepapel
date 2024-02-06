import { checkoutByOrderId } from "@/actions/checkout-order";
import { CheckoutByOrderResponse } from "@/types";
import { useMutation } from "@tanstack/react-query";

function useCheckoutOrder({
  orderId,
  onError,
  onSuccess,
  onSettled,
  onMutate,
}: {
  orderId: string;
  onError?: (err: Error, variables: void, context: unknown) => void;
  onSuccess?: (
    data: CheckoutByOrderResponse,
    variables: void,
    context: unknown,
  ) => void;
  onSettled?: (
    data: CheckoutByOrderResponse | undefined,
    error: Error | null,
    variables: void,
    context: unknown,
  ) => void;
  onMutate?: (variables: void) => void;
}) {
  const mutationFn = async () => {
    return await checkoutByOrderId(orderId);
  };

  return useMutation({
    mutationFn,
    onError,
    onSuccess,
    onSettled,
    onMutate,
  });
}

export default useCheckoutOrder;
