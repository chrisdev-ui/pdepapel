import dynamic from "next/dynamic";

import { Container } from "@/components/ui/container";
import { ShopContentSkeleton } from "./components/skeletons";

const Newsletter = dynamic(() => import("@/components/newsletter"), {
  ssr: false,
});

const Features = dynamic(() => import("@/components/features"), { ssr: false });

export default function loading() {
  return (
    <>
      <Features />
      <Container className="flex flex-col gap-y-8">
        <ShopContentSkeleton />
      </Container>
      <Newsletter />
    </>
  );
}
