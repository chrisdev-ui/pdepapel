import { env } from "@/lib/env.mjs";
import { Shipping, ShippingTrackingEvent } from "@/types";
import axios from "axios";

export interface TrackShipmentResponse {
  success: boolean;
  shipping: Shipping;
  tracking: any[];
  events: ShippingTrackingEvent[];
}

export interface TrackShipmentVariables {
  shippingId: string;
  guestId?: string | null;
  sessionToken?: string | null;
}

const API_URL = `${env.NEXT_PUBLIC_API_URL}/shipment/track`;

export const postTrackShipment = async ({
  shippingId,
  guestId,
  sessionToken,
}: TrackShipmentVariables): Promise<TrackShipmentResponse> => {
  const response = await axios.post(
    API_URL,
    { shippingId, guestId },
    sessionToken
      ? { headers: { Authorization: `Bearer ${sessionToken}` } }
      : undefined,
  );

  return response.data;
};
