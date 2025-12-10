import { getBanners } from "@/actions/get-banners";
import BannersCta from "@/components/banners-cta";

export const BannersCtaSection = async () => {
  const banners = await getBanners();

  return <BannersCta banners={banners} />;
};
