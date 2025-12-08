import Link from "next/link";

import { CldImage } from "@/components/ui/CldImage";
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
              "group relative flex items-center justify-center overflow-hidden rounded-xl px-10 py-32 transition",
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
            href={banner.callToAction ?? "#"}
          >
            <CldImage
              src={banner.imageUrl}
              alt={`Banner promocional ${index + 1}`}
              fill
              className="object-cover object-center transition-transform duration-500 group-hover:scale-110"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          </Link>
        ))}
      </div>
    </Container>
  );
};

export default BannersCta;
