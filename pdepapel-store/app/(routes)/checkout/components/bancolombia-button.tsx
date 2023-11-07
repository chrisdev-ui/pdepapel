import Link from "next/link";

interface BancolombiaButtonProps {
  url?: string;
}

export const BancolombiaButton: React.FC<BancolombiaButtonProps> = ({
  url = "#",
}) => {
  return (
    <Link
      href={url}
      className="group flex w-full max-w-max touch-manipulation items-center justify-center bg-transparent text-black"
      target="_self"
    >
      <span className="font-roboto after:font-roboto relative flex h-8 min-h-[40px] min-w-[172.67px] cursor-pointer select-none items-center justify-center whitespace-nowrap rounded-[30px] border-0 bg-[#f9c300] px-4 py-0 text-center align-middle text-xl font-semibold normal-case leading-9 text-transparent transition-all duration-500 ease-out before:absolute before:-left-[2px] before:z-10 before:h-10 before:w-10 before:translate-x-0 before:rounded-full before:bg-white before:bg-[url('/images/bancolombia-logo.png')] before:bg-[length:24px] before:bg-center before:bg-no-repeat before:shadow-[0_0_10px_0_rgba(197,197,197,1)] before:transition-all before:duration-500 before:ease-out before:content-[''] after:absolute after:translate-x-5 after:text-lg after:font-semibold after:text-black after:transition-all after:duration-500 after:ease-out after:content-['Bancolombia'] hover:bg-gray-900 hover:outline-none group-hover:bg-gray-900 group-hover:before:translate-x-[136px] group-hover:after:pr-[70px] group-hover:after:text-white group-hover:after:transition-all group-hover:after:duration-500 group-hover:after:ease-out xl:min-h-[60px] xl:min-w-[430px] before:xl:h-[60px] before:xl:w-[60px] before:xl:bg-[length:34px] after:xl:text-xl group-hover:before:xl:translate-x-[375px]">
        Bancolombia
      </span>
    </Link>
  );
};
