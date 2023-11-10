"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getCourierIcon } from "@/lib/utils";
import Image from "next/image";

interface CourierProps {
  name: string;
}

export const Courier: React.FC<CourierProps> = ({ name }) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative h-10 w-10">
            <Image
              src={getCourierIcon(name)}
              alt={name}
              fill
              className="rounded-md object-cover transition-all duration-300 ease-in-out hover:scale-105"
              sizes="(max-width: 640px) 100vw, 640px"
              quality={100}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{name}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
