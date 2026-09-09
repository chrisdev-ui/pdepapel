import { HomeContentForm } from "./components/home-content-form";
import { getHomeContent } from "../server/get-home-contents";

export default async function HomeContentPage({
  params,
}: {
  params: { storeId: string; homeContentId: string };
}) {
  const entry =
    params.homeContentId === "nuevo" || params.homeContentId === "new"
      ? null
      : await getHomeContent(params.storeId, params.homeContentId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 sm:p-8 sm:pt-6">
        <HomeContentForm initialData={entry} />
      </div>
    </div>
  );
}
