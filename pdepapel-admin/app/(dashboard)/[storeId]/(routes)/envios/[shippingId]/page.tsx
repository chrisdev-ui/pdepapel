import { redirect } from "next/navigation";

import { Models } from "@/constants";
import { ShipmentDetailClient } from "./components/shipment-detail-client";
import { getShipmentDetail } from "./server/get-shipment-detail";

export const revalidate = 0;

interface ShipmentDetailPageProps {
  params: {
    storeId: string;
    shippingId: string;
  };
}

export default async function ShipmentDetailPage({
  params,
}: ShipmentDetailPageProps) {
  try {
    const shipment = await getShipmentDetail(params.storeId, params.shippingId);

    return (
      <div className="flex-col">
        <div className="flex-1 space-y-4 p-8 pt-6">
          <ShipmentDetailClient shipment={shipment} />
        </div>
      </div>
    );
  } catch (error) {
    redirect(`/${params.storeId}/${Models.Shipments}`);
  }
}
