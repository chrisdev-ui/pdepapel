import { env } from "@/lib/env.mjs";
import axios from "axios";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/account/welcome-benefit`;

export type WelcomeBenefit = {
  code: string;
  type: "PERCENTAGE" | "FIXED";
  amount: number;
  minOrderValue: number | null;
  endDate: string;
};

export async function getWelcomeBenefit(sessionToken: string) {
  const response = await axios.get<{
    eligible: boolean;
    coupon?: WelcomeBenefit;
  }>(API_URL, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });

  return response.data.eligible ? response.data.coupon ?? null : null;
}
