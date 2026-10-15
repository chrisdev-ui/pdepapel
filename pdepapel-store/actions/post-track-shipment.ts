import { publicEnv as env } from "@/lib/public-env";
import { Shipping, ShippingTrackingEvent } from "@/types";
import axios from "axios";

export interface TrackShipmentResponse {
  success: boolean;
  shipping: Pick<
    Shipping,
    | "id"
    | "status"
    | "provider"
    | "carrierName"
    | "courier"
    | "trackingCode"
    | "trackingUrl"
    | "estimatedDeliveryDate"
    | "actualDeliveryDate"
    | "updatedAt"
  > | null;
  events: ShippingTrackingEvent[];
}

export interface TrackShipmentVariables {
  orderId: string;
  sessionToken?: string | null;
}

const API_URL = `${env.NEXT_PUBLIC_API_URL}/shipment/track`;

export const postTrackShipment = async ({
  orderId,
  sessionToken,
}: TrackShipmentVariables): Promise<TrackShipmentResponse> => {
  const response = await axios.post(
    API_URL,
    { orderId },
    sessionToken
      ? { headers: { Authorization: `Bearer ${sessionToken}` } }
      : undefined,
  );

  return response.data;
};
