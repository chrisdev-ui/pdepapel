import type { ImageLoaderProps } from "next/image";

const CLOUDINARY_HOSTNAME = "res.cloudinary.com";
const CLOUDINARY_UPLOAD_SEGMENT = "/image/upload/";
const CLOUDINARY_VERSION_PATTERN = /^v\d+$/;

export function cloudinaryImageLoader({
  src,
  width,
  quality,
}: ImageLoaderProps): string {
  let imageUrl: URL;

  try {
    imageUrl = new URL(src);
  } catch {
    return src;
  }

  if (imageUrl.hostname !== CLOUDINARY_HOSTNAME) return src;

  const uploadIndex = imageUrl.pathname.indexOf(CLOUDINARY_UPLOAD_SEGMENT);
  if (uploadIndex === -1) return src;

  const pathAfterUpload = imageUrl.pathname.slice(
    uploadIndex + CLOUDINARY_UPLOAD_SEGMENT.length,
  );
  const pathSegments = pathAfterUpload.split("/").filter(Boolean);
  const versionIndex = pathSegments.findIndex((segment) =>
    CLOUDINARY_VERSION_PATTERN.test(segment),
  );

  if (versionIndex === -1) return src;

  const assetPath = pathSegments.slice(versionIndex).join("/");
  const qualityTransformation = quality ? `q_${quality}` : "q_auto:eco";
  const transformations = [
    "f_auto",
    qualityTransformation,
    "c_limit",
    `w_${width}`,
  ].join(",");
  const cloudPath = imageUrl.pathname.slice(0, uploadIndex);

  imageUrl.pathname = `${cloudPath}${CLOUDINARY_UPLOAD_SEGMENT}${transformations}/${assetPath}`;
  imageUrl.search = "";

  return imageUrl.toString();
}
