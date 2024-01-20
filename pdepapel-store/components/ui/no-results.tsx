import { cn } from "@/lib/utils";

interface NoResultsProps {
  message: string;
  className?: string;
}

export const NoResults: React.FC<NoResultsProps> = ({ message, className }) => {
  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center text-neutral-500",
        className,
      )}
    >
      {message}
    </div>
  );
};
