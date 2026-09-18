import { notFound } from "next/navigation";

import { findOtherActiveWelcomeBenefit } from "@/lib/coupon-availability";
import prismadb from "@/lib/prismadb";

import { CouponForm } from "./components/coupon-form";
import { getCoupon } from "./server/get-coupon";

const NEW_SEGMENTS = new Set(["nuevo", "new"]);

export default async function CouponPage({
  params,
}: {
  params: { couponId: string; storeId: string };
}) {
  const isNew = NEW_SEGMENTS.has(params.couponId);
  const coupon = isNew ? null : await getCoupon(params.couponId, params.storeId);
  if (!isNew && !coupon) notFound();
  const activeWelcome = await findOtherActiveWelcomeBenefit(prismadb, params.storeId, coupon?.id);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 sm:p-8 sm:pt-6">
        <CouponForm initialData={coupon} activeWelcomeCode={activeWelcome?.code ?? null} />
      </div>
    </div>
  );
}
