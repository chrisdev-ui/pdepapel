"use client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { SignUp } from "@clerk/nextjs";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowBigLeftDashIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function RegisterPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [open, setOpen] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirectUrl");
  useEffect(() => {
    setIsMounted(true);
  }, []);
  if (!isMounted) {
    return null;
  }
  const handleCloseModal = () => {
    router.push(redirectUrl || "/");
    setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={handleCloseModal}>
      <DialogPortal>
        <DialogOverlay>
          <DialogPrimitive.Content className="relative flex h-full w-full items-center justify-center">
            <SignUp />
            <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
              <Button className="flex items-center gap-2 bg-blue-yankees p-8">
                <ArrowBigLeftDashIcon className="h-6 w-6" />
                Volver al sitio
              </Button>
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}
