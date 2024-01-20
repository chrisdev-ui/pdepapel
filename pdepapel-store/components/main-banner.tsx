import { Button } from "@/components/ui/button";
import { MainBanner as MainBannerType } from "@/types";
import Link from "next/link";

interface MainBannerProps {
  data: MainBannerType;
}

const MainBanner: React.FC<MainBannerProps> = ({ data }) => {
  return (
    data && (
      <div
        className="mx-0 my-10 flex w-full flex-col items-center justify-center space-y-3 bg-cover bg-center bg-no-repeat py-10 text-center xl:py-20"
        style={{
          backgroundImage: `url('${data?.imageUrl}')`,
        }}
      >
        {data?.title && <h4 className="font-serif text-4xl">{data.title}</h4>}
        {(data.label1 || data.label2 || data.highlight) && (
          <h2 className="py-2.5 text-3xl">
            {data?.label1 ?? ""}{" "}
            <span className="text-[#ef3636]">{data?.highlight ?? ""}</span>{" "}
            {data?.label2 ?? ""}
          </h2>
        )}
        <Link href={data?.callToAction ?? "#"}>
          <Button className="rounded border-none bg-pink-froly px-8 py-4 text-sm font-semibold text-blue-yankees outline-none transition duration-200 hover:bg-pink-shell">
            Explora
          </Button>
        </Link>
      </div>
    )
  );
};

export default MainBanner;
