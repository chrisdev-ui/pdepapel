import dynamic from "next/dynamic";

import { TrustStrip } from "@/components/trust-strip";
import { Container } from "@/components/ui/container";
import { ShopContentSkeleton } from "./components/skeletons";

const Newsletter = dynamic(() => import("@/components/newsletter"), {
  ssr: false,
});


export default function loading() {
  return (
    <>
      <TrustStrip />
      <Container className="flex flex-col gap-y-8">
        <ShopContentSkeleton />
      </Container>
      <Newsletter />
    </>
  );
}
