import { env } from "@/lib/env.mjs";
import { Coupon } from "@/types";
import axios, { AxiosResponse } from "axios";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/coupons/validate`;

export const validateCoupon = async (
  code: string,
  subtotal: number,
): Promise<Coupon | null> => {
  const response: AxiosResponse<Coupon | null> = await axios.post(API_URL, {
    code,
    subtotal,
  });

  return response.data;
};
