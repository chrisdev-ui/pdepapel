import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Separator } from "@/components/ui/separator";
import { Models } from "@/constants";
import { ReviewsColumn, columns } from "./columns";

interface ReviewsClientProps {
  data: ReviewsColumn[];
}

export const ReviewsClient = ({ data }: ReviewsClientProps) => {
  return (
    <>
      <div className="flex w-full items-center justify-between">
        <Heading
          title={`Reseñas (${data.length})`}
          description="Maneja las reseñas de los productos para tu tienda"
        />
        <RefreshButton />
      </div>
      <Separator />
      <DataTable
        tableKey={Models.Reviews}
        searchKey="name"
        columns={columns}
        data={data}
      />
    </>
  );
};
