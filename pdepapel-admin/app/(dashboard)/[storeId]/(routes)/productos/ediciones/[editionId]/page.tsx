import type { Metadata } from "next";

import { EditionWorkspace } from "./components/edition-workspace";
import { getEditionWorkspace } from "./server/get-edition-workspace";

export const metadata: Metadata = { title: "Edición de cápsulas" };

export default async function EdicionPage({ params }: { params: { storeId: string; editionId: string } }) {
  const data = await getEditionWorkspace(params.storeId, params.editionId);
  return (
    <div className="flex flex-col gap-6 p-4 pt-6 md:p-8">
      <EditionWorkspace data={JSON.parse(JSON.stringify(data))} />
    </div>
  );
}
