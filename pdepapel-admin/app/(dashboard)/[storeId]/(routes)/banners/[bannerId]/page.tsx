import { BannerForm } from "./components/banner-form";
import { getBanner } from "./server/get-banner";

export default async function BannerPage({
  params,
}: {
  params: { bannerId: string };
}) {
  const banner = await getBanner(params.bannerId);
  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <BannerForm initialData={banner} />
      </div>
    </div>
  );
}
