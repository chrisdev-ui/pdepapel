import { BrandedLoader } from "@/components/ui/branded-loader";

export default function Loading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] w-full items-center justify-center">
      <BrandedLoader />
    </div>
  );
}
