import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { v4 as uuidv4 } from "uuid";
import { getCoupons } from "./server/get-coupons";

const CouponClient = dynamic(() => import("./components/client"), {
  ssr: false,
});

export const metadata: Metadata = {
  title: "Cupones | PdePapel Admin",
  description: "Gestión de cupones de descuento",
};

export default async function CouponsPage({
  params,
}: {
  params: { storeId: string };
}) {
  const coupons = await getCoupons(params.storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <CouponClient data={coupons} key={uuidv4()} />
      </div>
    </div>
  );
}
