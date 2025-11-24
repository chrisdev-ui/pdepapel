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
  userId?: string | null;
  guestId?: string | null;
}

const API_URL = `${env.NEXT_PUBLIC_API_URL}/shipment/track`;

export const postTrackShipment = async ({
  shippingId,
  userId,
  guestId,
}: TrackShipmentVariables): Promise<TrackShipmentResponse> => {
  const response = await axios.post(API_URL, {
    shippingId,
    userId,
    guestId,
  });

  return response.data;
};
