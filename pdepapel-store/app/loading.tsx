import { Loader } from "@/components/loader";

export default function Loading() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Loader label="Cargando la página" />
    </div>
  );
}
