import { validateCoupon } from "@/actions/validate-coupon";
import { Coupon } from "@/types";
import { useMutation } from "@tanstack/react-query";

type CouponRequest = {
  code: string;
  subtotal: number;
};

interface UseValidateCouponProps {
  onError?: (err: Error, variables: CouponRequest, context: unknown) => void;
  onSuccess?: (
    data: Coupon | null,
    variables: CouponRequest,
    context: unknown,
  ) => void;
  onSettled?: (
    data: Coupon | null | undefined,
    error: Error | null,
    variables: CouponRequest,
    context: unknown,
  ) => void;
  onMutate?: (variables: CouponRequest) => void;
}

export default function useValidateCoupon({
  onError,
  onMutate,
  onSettled,
  onSuccess,
}: UseValidateCouponProps = {}) {
  const mutationFn = async (formData: CouponRequest) => {
    return await validateCoupon(formData.code, formData.subtotal);
  };

  return useMutation({
    mutationFn,
    onError,
    onSuccess,
    onSettled,
    onMutate,
  });
}
