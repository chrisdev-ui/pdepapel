import { getMainBanner } from "@/actions/get-main-banner";
import MainBanner from "@/components/main-banner";

export const MainBannerSection = async () => {
  const mainBanner = await getMainBanner();

  return <MainBanner data={mainBanner} />;
};
