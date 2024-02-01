import { cn } from "@/lib/utils";

interface ContainerProps {
  children: React.ReactNode;
  className?: string;
}

export const Container: React.FC<ContainerProps> = ({
  children,
  className,
}) => {
  return (
    <section
      className={cn("mx-auto max-w-screen-2xl p-4 sm:p-6 lg:p-8", className)}
    >
      {children}
    </section>
  );
};
