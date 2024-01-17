"use client";

import { ApiList } from "@/components/ui/api-list";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
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

export const BannerClient = ({ banners, mainBanner }: BannerClientProps) => {
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
            onClick={() => router.push(`/${params.storeId}/banners/main/new`)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Crear un nuevo banner principal
          </Button>
        )}
      </div>
      <Separator />
      <DataTable
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
        <Button onClick={() => router.push(`/${params.storeId}/banners/new`)}>
          <Plus className="mr-2 h-4 w-4" />
          Crear un nuevo banner
        </Button>
      </div>
      <Separator />
      <DataTable
        searchKey="callToAction"
        columns={bannerColumns}
        data={banners}
      />
      <Heading title="API" description="API calls para los banners" />
      <Separator />
      <ApiList entityName="banners" entityIdName="bannerId" />
      <Separator />
      <ApiList entityName="main-banner" entityIdName="mainBannerId" />
    </>
  );
};
