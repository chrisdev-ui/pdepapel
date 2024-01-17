import { LucideProps } from "lucide-react";

export const Icons = {
  sortUp: (props: LucideProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="13"
      height="12"
      viewBox="0 0 13 12"
      fill="none"
      {...props}
    >
      <g clipPath="url(#clip0_2990_26756)">
        <path d="M6.11933 5L4.07959 7H8.15906L6.11933 5Z" fill="#72727F" />
      </g>
      <defs>
        <clipPath id="clip0_2990_26756">
          <rect
            width="12.2384"
            height="12"
            fill="white"
            transform="matrix(1 0 0 -1 0 12)"
          />
        </clipPath>
      </defs>
    </svg>
  ),
  sortDown: (props: LucideProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="13"
      height="12"
      viewBox="0 0 13 12"
      fill="none"
      {...props}
    >
      <g clipPath="url(#clip0_2990_26752)">
        <path d="M6.11933 7L4.07959 5H8.15906L6.11933 7Z" fill="#72727F" />
      </g>
      <defs>
        <clipPath id="clip0_2990_26752">
          <rect width="12.2384" height="12" fill="white" />
        </clipPath>
      </defs>
    </svg>
  ),
  doubleArrowLeftIcon: (props: LucideProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 15 15"
      {...props}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M6.854 3.854a.5.5 0 10-.708-.708l-4 4a.5.5 0 000 .708l4 4a.5.5 0 00.708-.708L3.207 7.5l3.647-3.646zm6 0a.5.5 0 00-.708-.708l-4 4a.5.5 0 000 .708l4 4a.5.5 0 00.708-.708L9.207 7.5l3.647-3.646z"
        clipRule="evenodd"
      ></path>
    </svg>
  ),
  doubleArrowRightIcon: (props: LucideProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 15 15"
      {...props}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M2.146 11.146a.5.5 0 00.708.708l4-4a.5.5 0 000-.708l-4-4a.5.5 0 10-.708.708L5.793 7.5l-3.647 3.646zm6 0a.5.5 0 00.708.708l4-4a.5.5 0 000-.708l-4-4a.5.5 0 10-.708.708L11.793 7.5l-3.647 3.646z"
        clipRule="evenodd"
      ></path>
    </svg>
  ),
  mixerHorizontalIcon: (props: LucideProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 15 15"
      {...props}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M5.5 3a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM3 5c.017 0 .033 0 .05-.002a2.5 2.5 0 004.9 0A.507.507 0 008 5h5.5a.5.5 0 000-1H8c-.017 0-.033 0-.05.002a2.5 2.5 0 00-4.9 0A.507.507 0 003 4H1.5a.5.5 0 000 1H3zm8.95 5.998a2.5 2.5 0 01-4.9 0A.507.507 0 017 11H1.5a.5.5 0 010-1H7c.017 0 .033 0 .05.002a2.5 2.5 0 014.9 0A.506.506 0 0112 10h1.5a.5.5 0 010 1H12c-.017 0-.033 0-.05-.002zM8 10.5a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z"
        clipRule="evenodd"
      ></path>
    </svg>
  ),
  sortUpDownIcon: (props: LucideProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 15 15"
      {...props}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M4.932 5.432a.45.45 0 10.636.636L7.5 4.136l1.932 1.932a.45.45 0 00.636-.636l-2.25-2.25a.45.45 0 00-.636 0l-2.25 2.25zm5.136 4.136a.45.45 0 00-.636-.636L7.5 10.864 5.568 8.932a.45.45 0 00-.636.636l2.25 2.25a.45.45 0 00.636 0l2.25-2.25z"
        clipRule="evenodd"
      ></path>
    </svg>
  ),
};
