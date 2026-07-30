"use client";

import { ApiList } from "@/components/ui/api-list";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { Models } from "@/constants";
import { Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { PostColumn, columns } from "./columns";

interface PostClientProps {
  data: PostColumn[];
}

const PostClient: React.FC<PostClientProps> = ({ data }) => {
  const router = useRouter();
  const params = useParams();
  return (
    <>
      <div className="flex items-center justify-between">
        <Heading
          title={`Publicaciones de redes sociales (${data.length})`}
          description="Maneja las publicaciones de tus redes sociales a mostrar en el sitio."
        />
        <Button
          onClick={() => router.push(`/${params.storeId}/${Models.Posts}/new`)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Crear nueva publicación
        </Button>
      </div>
      <Separator />
      <DataTable
        tableKey={Models.Posts}
        searchKey="social"
        columns={columns}
        data={data}
      />
      <Heading title="API" description="API calls para los posts" />
      <Separator />
      <ApiList entityName={Models.Posts} entityIdName="postId" />
    </>
  );
};

export default PostClient;
