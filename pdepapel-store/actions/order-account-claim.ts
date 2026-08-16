import { env } from "@/lib/env.mjs";
import axios from "axios";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/orders`;

export const prepareOrderAccountClaim = async ({
  orderId,
  guestId,
}: {
  orderId: string;
  guestId: string;
}): Promise<{ token: string; expiresAt: string }> => {
  const response = await axios.post(`${API_URL}/${orderId}/account`, {
    guestId,
  });

  return response.data;
};

export const claimOrderForAccount = async ({
  orderId,
  sessionToken,
  token,
}: {
  orderId: string;
  sessionToken: string;
  token: string;
}): Promise<{ claimed: boolean }> => {
  const response = await axios.patch(
    `${API_URL}/${orderId}/account`,
    { token },
    { headers: { Authorization: `Bearer ${sessionToken}` } },
  );

  return response.data;
};
