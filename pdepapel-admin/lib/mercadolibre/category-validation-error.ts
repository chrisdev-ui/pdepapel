import { AppError } from "@/lib/api-errors";

import {
  getMercadoLibreCategoryInspectionHttpStatus,
  type MercadoLibreCategoryInspection,
} from "./category-validation";

export function getMercadoLibreCategoryAppError(
  inspection: Exclude<MercadoLibreCategoryInspection, { ok: true }>,
) {
  return new AppError(
    inspection.message,
    getMercadoLibreCategoryInspectionHttpStatus(inspection),
    {
      code: inspection.code,
      categoryId: inspection.categoryId,
      upstreamStatus: inspection.upstreamStatus,
    },
  );
}
