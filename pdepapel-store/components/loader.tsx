import Image from "next/image";

interface LoaderProps {
  label?: string;
}

export const Loader: React.FC<LoaderProps> = ({ label }) => {
  return (
    <>
      <div className="relative flex w-full items-center justify-center">
        <div className="absolute h-32 w-32 animate-spin rounded-full border-b-4 border-t-4 border-pink-froly" />
        <Image
          src="/images/no-text-transparent-bg.webp"
          width={200}
          height={200}
          alt="Logo Papelería P de Papel sin texto"
          className="h-28 w-28 rounded-full"
          placeholder="blur"
          priority
          sizes="(max-width: 640px) 100vw, 640px"
          unoptimized
        />
        {label && (
          <div className="absolute -bottom-8 text-blue-yankees">
            {label}
            <span className="ml-0.5 inline-block animate-dot-pulse font-mono text-xl font-bold">
              .
            </span>
            <span className="ml-0.5 inline-block animate-dot-pulse font-mono text-xl font-bold delay-300">
              .
            </span>
            <span className="ml-0.5 inline-block animate-dot-pulse font-mono text-xl font-bold delay-700">
              .
            </span>
          </div>
        )}
      </div>
    </>
  );
};
