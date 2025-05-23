"use client";

import { ApiList } from "@/components/ui/api-list";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { Models } from "@/constants";
import { Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { CategoryColumn, columns } from "./columns";

interface CategoryClientProps {
  data: CategoryColumn[];
}

const CategoryClient: React.FC<CategoryClientProps> = ({ data }) => {
  const router = useRouter();
  const params = useParams();
  return (
    <>
      <div className="flex items-center justify-between">
        <Heading
          title={`Categorías (${data.length})`}
          description="Maneja las categorías para tu tienda"
        />
        <Button
          onClick={() =>
            router.push(`/${params.storeId}/${Models.Categories}/new`)
          }
        >
          <Plus className="mr-2 h-4 w-4" />
          Crear categoría
        </Button>
      </div>
      <Separator />
      <DataTable
        tableKey={Models.Categories}
        searchKey="name"
        columns={columns}
        data={data}
      />
      <Heading title="API" description="API calls para las categorías" />
      <Separator />
      <ApiList entityName={Models.Categories} entityIdName="categoryId" />
    </>
  );
};

export default CategoryClient;
