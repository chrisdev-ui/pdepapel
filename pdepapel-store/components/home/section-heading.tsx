import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  title: string;
  id?: string;
  eyebrow?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function SectionHeading({ title, id, eyebrow, action, className }: SectionHeadingProps) {
  return (
    <div className={cn("flex items-end justify-between gap-4", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow}
        <h2 id={id} className="font-serif text-2xl font-bold text-blue-yankees sm:text-3xl">
          {title}
        </h2>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-3">{action}</div> : null}
    </div>
  );
}
