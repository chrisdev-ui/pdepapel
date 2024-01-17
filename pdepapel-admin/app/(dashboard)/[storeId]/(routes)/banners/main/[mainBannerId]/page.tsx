import prismadb from "@/lib/prismadb";
import { MainBannerForm } from "./components/main-banner-form";

export default async function MainBannerPage({
  params,
}: {
  params: { mainBannerId: string };
}) {
  const mainBanner = await prismadb.mainBanner.findUnique({
    where: {
      id: params.mainBannerId,
    },
  });
  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <MainBannerForm initialData={mainBanner} />
      </div>
    </div>
  );
}
