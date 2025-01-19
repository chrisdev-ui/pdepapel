"use client";

import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { cn, formatPhoneNumber } from "@/lib/utils";
import Link from "next/link";
import { useMemo } from "react";

interface WhatsappButtonProps {
  phone: string;
  withText?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export const WhatsappButton: React.FC<WhatsappButtonProps> = ({
  phone,
  className,
  withText = false,
  size = "sm",
}) => {
  const formattedPhone = useMemo(
    () => `57${phone.replace(/\D/g, "")}`,
    [phone],
  );
  const whatsappUrl = `https://wa.me/${formattedPhone}`;
  return (
    <Button variant="link" className={cn("px-1", className)} asChild>
      <Link href={whatsappUrl} target="_blank">
        <Icons.whatsapp
          className={cn("text-[#25D366]", {
            "h-5 w-5": size === "sm",
            "h-6 w-6": size === "md",
            "h-7 w-7": size === "lg",
          })}
        />
        <span className="sr-only">Abrir WhatsApp Web</span>
        {withText && (
          <span className="ml-2 text-sm">{formatPhoneNumber(phone)}</span>
        )}
      </Link>
    </Button>
  );
};
