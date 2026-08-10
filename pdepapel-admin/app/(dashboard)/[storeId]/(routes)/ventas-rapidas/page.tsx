import { PointOfSaleWorkspace } from "./components/point-of-sale-workspace";

export const revalidate = 0;

export default function PointOfSalePage() {
  return (
    <div className="flex-col">
      <div className="flex-1 p-4 pt-6 sm:p-8 sm:pt-6">
        <PointOfSaleWorkspace />
      </div>
    </div>
  );
}
