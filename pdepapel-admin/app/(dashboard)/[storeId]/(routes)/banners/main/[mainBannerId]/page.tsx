import dynamic from "next/dynamic";
import { getMainBannerById } from "./server/get-main-banner-by-id";

const MainBannerForm = dynamic(() => import("./components/main-banner-form"), {
  ssr: false,
});

export default async function MainBannerPage({
  params,
}: {
  params: { mainBannerId: string };
}) {
  const mainBanner = await getMainBannerById(params.mainBannerId);
  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <MainBannerForm initialData={mainBanner} />
      </div>
    </div>
  );
}
