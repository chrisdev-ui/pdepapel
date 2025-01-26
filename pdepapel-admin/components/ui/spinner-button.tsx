import { Loader2 } from "lucide-react";

export const SpinnerButton = () => {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-y-8">
      <Loader2 className="h-24 w-24 animate-spin bg-background" />
      <span className="sr-only">Ejecutando operación...</span>
    </div>
  );
};
