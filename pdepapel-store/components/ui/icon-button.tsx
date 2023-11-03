import { cn } from "@/lib/utils";
import { MouseEventHandler } from "react";

interface IconButtonProps {
  className?: string;
  isDisabled?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement> | undefined;
  icon: React.ReactElement;
}

export const IconButton: React.FC<IconButtonProps> = ({
  className,
  isDisabled = false,
  onClick,
  icon,
}) => {
  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={cn(
        "flex items-center justify-center rounded-full border bg-white p-2 shadow-md transition hover:scale-110",
        className,
      )}
    >
      {icon}
    </button>
  );
};
