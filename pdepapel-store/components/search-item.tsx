import { Image } from "@/types";
import NextImage from "next/image";
import Link from "next/link";
import { Currency } from "./ui/currency";

interface SearchItemProps {
  id: string;
  image?: Image;
  name: string;
  price: number | string;
  minPrice?: number;
  isGroup?: boolean;
  innerRef?: React.Ref<HTMLAnchorElement>;
  closeAll: () => void;
}

export const SearchItem: React.FC<SearchItemProps> = ({
  id,
  image,
  name,
  price,
  minPrice,
  isGroup,
  innerRef,
  closeAll,
}) => {
  return (
    <Link
      ref={innerRef}
      href={`/product/${id}`}
      className="grid grid-cols-[40px_1fr] gap-2.5 rounded p-1 hover:bg-blue-baby/50 hover:ring-1 hover:ring-slate-200"
      onClick={closeAll}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          closeAll();
        }
      }}
    >
      <div className="relative h-10 w-10">
        <NextImage
          src={image?.url ?? "/images/placeholder.png"}
          alt={name ?? "Imagen del producto"}
          fill
          sizes="(max-width: 640px) 40px, 120px"
          priority
          className="rounded-md"
        />
      </div>
      <div className="flex max-h-10 grow items-center justify-between">
        <div className="flex h-full w-full max-w-xs flex-col justify-center font-serif text-xs font-normal tracking-tight">
          <p className="w-full truncate text-left">{name}</p>
        </div>
        <div className="flex flex-col items-end">
          {isGroup && <span className="text-[10px] text-gray-500">Desde</span>}
          <Currency
            className="text-sm"
            value={isGroup && minPrice ? minPrice : price}
          />
        </div>
      </div>
    </Link>
  );
};
