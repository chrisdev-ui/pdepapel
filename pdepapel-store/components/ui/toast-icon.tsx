import { cn } from "@/lib/utils";
import { ShoppingCart } from "lucide-react";
import { Icons } from "../icons";

interface ToastIconProps {
  icon: "cart" | "heart";
  variant?: "success" | "destructive" | "warning" | "info" | "default";
}

export const ToastIcon: React.FC<ToastIconProps> = ({
  icon,
  variant = "default",
}) => {
  const toastIcon: Record<string, React.ReactNode> = {
    cart: <ShoppingCart className="h-5 w-5" />,
    heart: <Icons.heart className="h-5 w-5" />,
  };
  return (
    <div
      className={cn("flex h-10 w-10 items-center justify-center rounded-full", {
        "bg-success-foreground text-success": variant === "success",
        "bg-destructive-foreground text-destructive": variant === "destructive",
        "bg-warning-foreground text-warning": variant === "warning",
        "bg-info-foreground text-info": variant === "info",
        "bg-blue-yankees text-white": variant === "default",
      })}
    >
      {toastIcon[icon]}
    </div>
  );
};
