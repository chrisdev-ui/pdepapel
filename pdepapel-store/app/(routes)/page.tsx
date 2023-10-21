import { getBillboards } from "@/actions/get-billboards";
import { Features } from "@/components/features";
import { HeroSlider } from "@/components/hero-slider";

export const revalidate = 0;

export default async function HomePage() {
  const billboards = await getBillboards();
  return (
    <>
      <HeroSlider data={billboards} />
      <Features />
    </>
  );
}
