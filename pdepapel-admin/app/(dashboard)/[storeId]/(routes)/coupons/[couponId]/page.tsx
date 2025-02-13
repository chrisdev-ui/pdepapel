import { v4 as uuidv4 } from "uuid";
import { CouponForm } from "./components/coupon-form";
import { getCoupon } from "./server/get-coupon";

export default async function CouponPage({
  params,
}: {
  params: { couponId: string; storeId: string };
}) {
  const coupon = await getCoupon(params.couponId, params.storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <CouponForm initialData={coupon} key={uuidv4()} />
      </div>
    </div>
  );
}
