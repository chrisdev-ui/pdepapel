"use client";

import { Row } from "@tanstack/react-table";
import { ShoppingCart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useWishlist } from "@/hooks/use-wishlist";
import { WishlistColumn } from "./columns";

interface AddToCartButtonProps {
  row: Row<WishlistColumn>;
}

export const AddToCartButton: React.FC<AddToCartButtonProps> = ({ row }) => {
  const { moveToCart } = useWishlist();
  const onMoveToCart = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    e.stopPropagation();
    moveToCart(row.original.id);
  };
  return (
    <Button onClick={onMoveToCart} disabled={Number(row.original.stock) === 0}>
      <ShoppingCart className="mr-2 h-5 w-5" />
      Agregar al Carrito
    </Button>
  );
};
