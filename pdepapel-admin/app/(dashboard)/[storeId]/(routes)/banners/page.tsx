import prismadb from "@/lib/prismadb";
import { format } from "date-fns";
import { BannerClient } from "./components/client";
import { BannerColumn, MainBannerColumn } from "./components/columns";

export default async function BannersPage({
  params,
}: {
  params: {
    storeId: string;
  };
}) {
  const mainBanner = await prismadb.mainBanner.findFirst({
    where: {
      storeId: params.storeId,
    },
  });
  const banners = await prismadb.banner.findMany({
    where: {
      storeId: params.storeId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const formattedMainBanner: MainBannerColumn[] = mainBanner
    ? [
        {
          id: mainBanner.id,
          title: mainBanner.title ?? "Sin definir",
          label1: mainBanner.label1 ?? "Sin definir",
          highlight: mainBanner.highlight ?? "Sin definir",
          label2: mainBanner.label2 ?? "Sin definir",
          imageUrl: mainBanner.imageUrl,
          callToAction: mainBanner.callToAction,
          createdAt: format(mainBanner.createdAt, "MMMM d, yyyy"),
        },
      ]
    : [];

  const formattedBanners: BannerColumn[] = banners.map((banner) => ({
    id: banner.id,
    imageUrl: banner.imageUrl,
    callToAction: banner.callToAction,
    createdAt: format(banner.createdAt, "MMMM d, yyyy"),
  }));

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <BannerClient
          mainBanner={formattedMainBanner}
          banners={formattedBanners}
        />
      </div>
    </div>
  );
}
