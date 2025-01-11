"use client";

import { CldImage as CldImageDefault, CldImageProps } from "next-cloudinary";

export const CldImage: React.FC<CldImageProps> = (props) => {
  return <CldImageDefault {...props} />;
};
