import Features from "@/components/features";
import {
  BannersCtaSkeleton,
  FeaturedProductsSkeleton,
  HeroSliderSkeleton,
  MainBannerSkeleton,
  NewArrivalsSkeleton,
} from "@/components/home-skeletons";
import Newsletter from "@/components/newsletter";

export default function Loading() {
  return (
    <>
      <HeroSliderSkeleton />
      <Features />
      <FeaturedProductsSkeleton />
      <MainBannerSkeleton />
      <NewArrivalsSkeleton />
      <BannersCtaSkeleton />
      <Newsletter />
    </>
  );
}
