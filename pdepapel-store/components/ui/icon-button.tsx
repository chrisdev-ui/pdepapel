import { cn } from "@/lib/utils";
import { MouseEventHandler } from "react";

interface IconButtonProps {
  className?: string;
  isDisabled?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement> | undefined;
  icon: React.ReactElement;
  ariaLabel?: string;
}

export const IconButton: React.FC<IconButtonProps> = ({
  className,
  isDisabled = false,
  onClick,
  icon,
  ariaLabel,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      aria-label={ariaLabel}
      className={cn(
        "flex h-11 w-11 min-w-[44px] shrink-0 touch-manipulation items-center justify-center rounded-full border bg-white p-2 shadow-md transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2 motion-reduce:transform-none",
        className,
        {
          "cursor-not-allowed opacity-75": isDisabled,
        },
      )}
    >
      {icon}
    </button>
  );
};
