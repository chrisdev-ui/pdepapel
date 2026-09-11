import { notFound } from "next/navigation";

import { CouponForm } from "./components/coupon-form";
import { getCoupon } from "./server/get-coupon";

const NEW_SEGMENTS = new Set(["nuevo", "new"]);

export default async function CouponPage({
  params,
}: {
  params: { couponId: string; storeId: string };
}) {
  const coupon = NEW_SEGMENTS.has(params.couponId) ? null : await getCoupon(params.couponId, params.storeId);
  if (!NEW_SEGMENTS.has(params.couponId) && !coupon) notFound();

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 sm:p-8 sm:pt-6">
        <CouponForm initialData={coupon} />
      </div>
    </div>
  );
}
