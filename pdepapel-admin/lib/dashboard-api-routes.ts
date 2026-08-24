import { Models } from "@/constants";

const DASHBOARD_API_MODEL_ALIASES: Partial<Record<Models, Models>> = {
  [Models.LowStock]: Models.Products,
  [Models.OutOfStock]: Models.Products,
};

export function getDashboardApiRoute(storeId: string, model: Models) {
  const resource = DASHBOARD_API_MODEL_ALIASES[model] ?? model;

  return `/${encodeURIComponent(storeId)}/${resource}`;
}
