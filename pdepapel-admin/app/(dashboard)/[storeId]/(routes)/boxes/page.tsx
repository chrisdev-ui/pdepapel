import { BoxClient } from "./components/client";
import { BoxColumn } from "./components/columns";
import { getBoxes } from "./server/get-boxes";

const BoxesPage = async ({ params }: { params: { storeId: string } }) => {
  const boxes = await getBoxes(params.storeId);

  const formattedBoxes: BoxColumn[] = boxes.map((item) => ({
    ...item,
    dimensions: `${item.width} x ${item.height} x ${item.length}`,
  }));

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <BoxClient data={formattedBoxes} />
      </div>
    </div>
  );
};

export default BoxesPage;
