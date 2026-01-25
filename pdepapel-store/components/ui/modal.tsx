"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/components/ui/use-mobile";
import * as React from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ open, onClose, children }) => {
  const isMobile = useIsMobile();

  const onChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onChange}>
        <DrawerContent className="max-h-[96vh]">
          <DrawerTitle className="sr-only">
            Vista previa del producto
          </DrawerTitle>
          <DrawerDescription className="sr-only">
            Detalles del producto seleccionado
          </DrawerDescription>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-2">
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onChange}>
      <DialogContent className="w-full max-w-3xl overflow-hidden rounded-lg text-left align-middle shadow-2xl">
        <DialogTitle className="sr-only">Vista previa del producto</DialogTitle>
        <DialogDescription className="sr-only">
          Detalles del producto seleccionado
        </DialogDescription>
        <div className="relative flex w-full items-center overflow-hidden px-4 pb-8 pt-14 sm:px-6 sm:pt-8 md:p-6 lg:p-8">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
};
