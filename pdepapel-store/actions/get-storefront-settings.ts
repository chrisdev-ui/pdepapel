import { cache } from "react";

import { EMPTY_BANK_TRANSFER, parseBankTransfer, reportIncompleteBankTransfer } from "@/lib/bank-transfer";
import { withUpstreamTimeout } from "@/lib/catalog-cache";
import { publicEnv as env } from "@/lib/public-env";
import { StorefrontSettings } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/public/storefront`;

export const EMPTY_STOREFRONT_SETTINGS: StorefrontSettings = {
  freeShippingThreshold: null,
  openingHoursLabel: null,
  cityName: null,
  hasPhysicalStore: false,
  physicalAddress: null,
  deliveryEstimate: null,
  bankTransfer: EMPTY_BANK_TRANSFER,
};

/**
 * Public store settings (free-shipping threshold). Failures degrade to the
 * defaults so the header and checkout still render without the promise.
 */
export const getStorefrontSettings = cache(
  async (): Promise<StorefrontSettings> => {
    try {
      const response = await fetch(
        API_URL,
        withUpstreamTimeout({ next: { revalidate: 300, tags: ["storefront-settings"] } }),
      );
      if (!response.ok) return EMPTY_STOREFRONT_SETTINGS;
      const data = await response.json();
      const bankTransfer = parseBankTransfer(data?.bankTransfer);
      reportIncompleteBankTransfer("ajustes de la tienda", bankTransfer);
      const threshold = Number(data?.freeShippingThreshold);
      const label =
        typeof data?.openingHoursLabel === "string"
          ? data.openingHoursLabel.trim()
          : "";
      return {
        freeShippingThreshold:
          Number.isFinite(threshold) && threshold > 0 ? threshold : null,
        openingHoursLabel: label || null,
        cityName:
          typeof data?.cityName === "string" && data.cityName.trim()
            ? data.cityName.trim()
            : null,
        hasPhysicalStore: data?.hasPhysicalStore === true,
        physicalAddress:
          typeof data?.physicalAddress === "string" &&
          data.physicalAddress.trim()
            ? data.physicalAddress.trim()
            : null,
        deliveryEstimate:
          typeof data?.deliveryEstimate === "string" &&
          data.deliveryEstimate.trim()
            ? data.deliveryEstimate.trim()
            : null,
        bankTransfer,
      };
    } catch {
      return EMPTY_STOREFRONT_SETTINGS;
    }
  },
);
