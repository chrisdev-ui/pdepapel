import { BannerClient } from "./components/client";
import { getBanners } from "./server/get-banners";
import { getMainBanner } from "./server/get-main-banner";

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
