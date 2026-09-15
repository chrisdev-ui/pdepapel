import { cache } from "react";

import { env } from "@/lib/env.mjs";
import { StorefrontSettings } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/public/storefront`;

export const EMPTY_STOREFRONT_SETTINGS: StorefrontSettings = {
  freeShippingThreshold: null,
  openingHoursLabel: null,
  cityName: null,
  hasPhysicalStore: false,
  physicalAddress: null,
  deliveryEstimate: null,
};

/**
 * Public store settings (free-shipping threshold). Failures degrade to the
 * defaults so the header and checkout still render without the promise.
 */
export const getStorefrontSettings = cache(
  async (): Promise<StorefrontSettings> => {
    try {
      const response = await fetch(API_URL, {
        next: { revalidate: 300, tags: ["storefront-settings"] },
      });
      if (!response.ok) return EMPTY_STOREFRONT_SETTINGS;
      const data = await response.json();
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
      };
    } catch {
      return EMPTY_STOREFRONT_SETTINGS;
    }
  },
);
