import axios from "axios";

import { env } from "@/lib/env.mjs";

export interface GiftCardValidation {
  balance: number;
  last4: string;
  expiresAt: string | null;
}

/**
 * Comprueba un código de tarjeta de regalo en el checkout. La API responde
 * solo saldo y terminación; nunca el código de vuelta. Los errores traen un
 * mensaje para la clienta (`error`).
 */
export async function validateGiftCard(code: string): Promise<GiftCardValidation> {
  const response = await axios.post<GiftCardValidation>(
    `${env.NEXT_PUBLIC_API_URL}/gift-cards/validate`,
    { code },
    { timeout: 10_000 },
  );
  return response.data;
}
