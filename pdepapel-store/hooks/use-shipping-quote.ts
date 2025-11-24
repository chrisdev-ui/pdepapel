import { getShippingQuote } from "@/actions/get-shipping-quote";
import { ShippingQuoteRequest, ShippingQuoteResponse } from "@/types";
import { useMutation } from "@tanstack/react-query";

export function useShippingQuote({
  onError,
  onSuccess,
  onSettled,
  onMutate,
}: {
  onError?: (
    err: Error,
    variables: ShippingQuoteRequest,
    context: unknown,
  ) => void;
  onSuccess?: (
    data: ShippingQuoteResponse,
    variables: ShippingQuoteRequest,
    context: unknown,
  ) => void;
  onSettled?: (
    data: ShippingQuoteResponse | undefined,
    error: Error | null,
    variables: ShippingQuoteRequest,
    context: unknown,
  ) => void;
  onMutate?: (variables: ShippingQuoteRequest) => void;
} = {}) {
  const mutationFn = async (
    request: ShippingQuoteRequest,
  ): Promise<ShippingQuoteResponse> => {
    return await getShippingQuote(request);
  };

  return useMutation({
    mutationFn,
    onError,
    onSuccess,
    onSettled,
    onMutate,
  });
}
