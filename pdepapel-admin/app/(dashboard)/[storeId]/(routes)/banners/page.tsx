import dynamic from "next/dynamic";
import { getBanners } from "./server/get-banners";
import { getMainBanner } from "./server/get-main-banner";

const BannerClient = dynamic(() => import("./components/client"), {
  ssr: false,
});

export const revalidate = 0;

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Banners | PdePapel Admin",
  description: "Gestión de banners",
};

export default async function BannersPage({
  params,
}: {
  params: {
    storeId: string;
  };
}) {
  const mainBanner = await getMainBanner(params.storeId);
  const banners = await getBanners(params.storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <BannerClient mainBanner={mainBanner} banners={banners} />
      </div>
    </div>
  );
}
