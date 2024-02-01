import Link from "next/link";

import { Container } from "@/components/ui/container";
import { cn } from "@/lib/utils";
import { Banner } from "@/types";

interface BannersCtaProps {
  banners: Banner[];
}

const BannersCta: React.FC<BannersCtaProps> = ({ banners }) => {
  if (!banners.length) return null;

  const numberOfBanners = banners.length;
  let gridCols = "grid-cols-1 md:grid-cols-6";
  let colSpan = "md:col-span-3";

  if (numberOfBanners === 1) {
    gridCols = "grid-cols-1";
    colSpan = "col-span-1";
  } else if (numberOfBanners === 2) {
    gridCols = "grid-cols-1 md:grid-cols-2";
    colSpan = "col-span-1 md:col-span-2";
  } else if (numberOfBanners === 3) {
    gridCols = "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
    colSpan = "col-span-1";
  } else if (numberOfBanners === 4) {
    gridCols = "grid-cols-1 md:grid-cols-3 lg:grid-cols-4";
    colSpan = "col-span-1";
  }

  return (
    <Container component="section">
      <div className={cn("grid gap-x-8 gap-y-4", gridCols)}>
        {banners.map((banner, index) => (
          <Link
            className={cn(
              "flex items-center justify-center rounded-xl bg-cover bg-center bg-no-repeat px-10 py-32 transition hover:scale-105",
              {
                [colSpan]: numberOfBanners !== 5,
                "col-span-3": numberOfBanners === 5 && index <= 1,
                "col-span-3 md:col-span-2": numberOfBanners === 5 && index > 1,
              },
              {
                "py-44": numberOfBanners <= 2,
                "py-40": numberOfBanners === 5,
              },
            )}
            key={`mini-banner${index}`}
            style={{
              backgroundImage: `url(${banner.imageUrl})`,
            }}
            href={banner.callToAction ?? "#"}
          />
        ))}
      </div>
    </Container>
  );
};

export default BannersCta;
