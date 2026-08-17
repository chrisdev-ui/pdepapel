import Image from "next/image";

export const Spooky = () => (
  <div
    aria-hidden="true"
    className="pointer-events-none fixed inset-0 z-10 overflow-hidden"
  >
    <Image
      src="/images/spooky-corner.webp"
      alt=""
      width={640}
      height={640}
      sizes="(max-width: 640px) 96px, (max-width: 1024px) 144px, 176px"
      className="absolute right-2 top-32 h-auto w-16 opacity-90 sm:-right-6 sm:w-36 lg:w-44"
    />
    <Image
      src="/images/spooky-corner.webp"
      alt=""
      width={640}
      height={640}
      sizes="144px"
      className="absolute -bottom-4 -left-8 hidden h-auto w-36 -scale-x-100 opacity-75 md:block"
    />
  </div>
);
