import type { Metadata } from "next";
import { CloudinaryClient } from "./components/client";

export const metadata: Metadata = {
  title: "Imágenes huérfanas | PdePapel Admin",
};

const CloudinaryPage = async ({ params }: { params: { storeId: string } }) => {
  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <CloudinaryClient />
      </div>
    </div>
  );
};

export default CloudinaryPage;
