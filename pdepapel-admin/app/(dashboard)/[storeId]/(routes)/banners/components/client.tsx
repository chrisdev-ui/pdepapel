"use client";

import { ApiList } from "@/components/ui/api-list";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { Models } from "@/constants";
import { Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import {
  BannerColumn,
  MainBannerColumn,
  bannerColumns,
  mainBannerColumns,
} from "./columns";

interface BannerClientProps {
  banners: BannerColumn[];
  mainBanner: MainBannerColumn[];
}

const BannerClient: React.FC<BannerClientProps> = ({ banners, mainBanner }) => {
  const router = useRouter();
  const params = useParams();
  return (
    <>
      <div className="flex items-center justify-between">
        <Heading
          title={`Banner principal`}
          description="Maneja el banner principal para tu tienda"
        />
        {mainBanner.length === 0 && (
          <Button
            onClick={() =>
              router.push(`/${params.storeId}/${Models.Banners}/main/new`)
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Crear un nuevo banner principal
          </Button>
        )}
      </div>
      <Separator />
      <DataTable
        tableKey={Models.MainBanner}
        searchKey="title"
        columns={mainBannerColumns}
        data={mainBanner}
      />
      <Separator />
      <div className="flex items-center justify-between">
        <Heading
          title={`Banners (${banners.length})`}
          description="Maneja los banners (call to action) para tu tienda"
        />
        <Button
          onClick={() =>
            router.push(`/${params.storeId}/${Models.Banners}/new`)
          }
        >
          <Plus className="mr-2 h-4 w-4" />
          Crear un nuevo banner
        </Button>
      </div>
      <Separator />
      <DataTable
        tableKey={Models.Banners}
        searchKey="callToAction"
        columns={bannerColumns}
        data={banners}
      />
      <Heading title="API" description="API calls para los banners" />
      <Separator />
      <ApiList entityName={Models.Banners} entityIdName="bannerId" />
      <Separator />
      <ApiList entityName={Models.MainBanner} entityIdName="mainBannerId" />
    </>
  );
};

export default BannerClient;
