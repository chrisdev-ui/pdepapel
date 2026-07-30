"use client";

import { Row } from "@tanstack/react-table";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useWishlist } from "@/hooks/use-wishlist";
import { WishlistColumn } from "./columns";

interface DeleteButtonProps {
  row: Row<WishlistColumn>;
}

export const DeleteButton: React.FC<DeleteButtonProps> = ({ row }) => {
  const { removeItem } = useWishlist();
  const onDelete = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    e.stopPropagation();
    removeItem(row.original.id);
  };
  return (
    <Button title="Eliminar producto" variant="link" onClick={onDelete}>
      <Trash2 className="h-5 w-5" />
    </Button>
  );
};
