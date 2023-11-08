import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface BancolombiaButtonProps {
  url?: string;
}

export const BancolombiaButton: React.FC<BancolombiaButtonProps> = ({
  url = "#",
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const [buttonWidth, setButtonWidth] = useState(() =>
    buttonRef.current ? buttonRef.current.offsetWidth : 0,
  );

  useEffect(() => {
    const updateWidth = () => {
      if (buttonRef.current) {
        setButtonWidth(buttonRef.current.offsetWidth);
      }
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);

    return () => {
      window.removeEventListener("resize", updateWidth);
    };
  }, []);

  return (
    <Link href={url} className="w-full">
      <Button
        ref={buttonRef}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="group relative flex w-full select-none items-center justify-center whitespace-nowrap rounded-[30px] border-0 bg-[#f9c300] px-4 py-0 text-center align-middle font-roboto text-lg font-semibold normal-case leading-9 text-transparent transition-all duration-500 ease-out hover:bg-gray-900"
      >
        <span
          style={{
            transform: hovered
              ? `translateX(calc(${buttonWidth}px - 30px))`
              : "translateX(0)",
          }}
          className="absolute -left-2 z-10 h-10 w-10 translate-x-0 rounded-full bg-white bg-[url('/images/bancolombia-logo.png')] bg-[length:24px] bg-center bg-no-repeat shadow-[0_0_10px_0_rgba(197,197,197,1)] transition-all duration-500 ease-out"
        />
        <span className="absolute font-roboto text-lg font-semibold text-black transition-all duration-500 ease-out group-hover:text-white group-hover:transition-all group-hover:duration-500 group-hover:ease-out">
          Bancolombia
        </span>
      </Button>
    </Link>
  );
};
