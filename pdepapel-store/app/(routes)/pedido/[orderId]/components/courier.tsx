import Image from "next/image";

import { getCourierIcon } from "@/lib/utils";

interface CourierProps {
  name: string;
  /** Service or product name from the carrier ("Normal", "Mensajería"). */
  service?: string | null;
}

/** Carrier logo with its name beside it, readable without hovering. */
export const Courier: React.FC<CourierProps> = ({ name, service }) => {
  return (
    <span className="inline-flex items-center gap-3">
      <span className="relative h-10 w-14 shrink-0 overflow-hidden rounded-md border border-border bg-white">
        <Image
          src={getCourierIcon(name)}
          alt=""
          fill
          className="object-contain p-1"
          sizes="56px"
          unoptimized
        />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-sans text-sm font-bold text-blue-yankees">
          {name}
        </span>
        {service && (
          <span className="text-xs text-muted-foreground">{service}</span>
        )}
      </span>
    </span>
  );
};
