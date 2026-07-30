"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Models } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { Copy, Eye, MoreHorizontal, Phone } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { CustomerColumn } from "./columns";

interface CellActionProps {
  data: CustomerColumn;
}

export const CellAction: React.FC<CellActionProps> = ({ data }) => {
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();

  const onCopy = (text: string, message: string) => {
    navigator.clipboard.writeText(text);
    toast({
      description: message,
      variant: "success",
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">Abrir Menú</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Acciones</DropdownMenuLabel>
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => onCopy(data.phone, "Teléfono copiado al portapapeles")}
        >
          <Copy className="mr-2 h-4 w-4" />
          Copiar teléfono
        </DropdownMenuItem>
        {data.email && (
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => onCopy(data.email!, "Email copiado al portapapeles")}
          >
            <Copy className="mr-2 h-4 w-4" />
            Copiar email
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() =>
            router.push(
              `/${params.storeId}/${Models.Orders}?phone=${encodeURIComponent(data.phone)}`,
            )
          }
        >
          <Eye className="mr-2 h-4 w-4" />
          Ver órdenes
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => {
            const cleaned = data.phone.replace(/\D/g, "");
            const phone = cleaned.startsWith("57") ? cleaned : `57${cleaned}`;
            const whatsappUrl = `https://wa.me/${phone}`;
            window.open(whatsappUrl, "_blank");
          }}
        >
          <Phone className="mr-2 h-4 w-4" />
          Contactar por WhatsApp
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
