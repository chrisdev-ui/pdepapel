import { cn } from "@/lib/utils";

interface NewBadgeProps {
  text: string;
  containerClasses?: string;
  spanClasses?: string;
  textClasses?: string;
}

export const NewBadge: React.FC<NewBadgeProps> = ({
  text,
  containerClasses,
  spanClasses,
  textClasses,
}) => {
  return (
    <div
      className={cn(
        "absolute -right-0 -top-4 h-28 w-28 overflow-hidden md:h-40 md:w-40",
        containerClasses,
      )}
    >
      <span
        className={cn(
          "absolute -left-[25px] top-[30px] block w-[225px] rotate-45 border-2 border-dotted border-blue-yankees bg-pink-shell px-0 py-2.5 text-center font-serif font-semibold uppercase text-blue-yankees shadow-badge outline outline-4 outline-white-rock [text-shadow:0_1px_1px_rgba(0,0,0,.2)]",
          spanClasses,
        )}
      >
        <span className={cn("mr-10 animate-pulse md:mr-0", textClasses)}>
          {text}
        </span>
      </span>
    </div>
  );
};
