import { handleErrorResponse } from "@/lib/api-error-response";
import { ErrorFactory } from "@/lib/api-errors";;
import cloudinaryInstance from "@/lib/cloudinary";
import { env } from "@/lib/env.mjs";
import { verifyStoreOwner } from "@/lib/db-utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();

    // Verify ownership
    await verifyStoreOwner(userId, params.storeId);

    if (env.NODE_ENV !== "development") {
      throw ErrorFactory.InvalidRequest(
        "Cleanup only allowed in development environment",
      );
    }

    const folderName = env.NEXT_PUBLIC_CLOUDINARY_FOLDER_NAME;

    if (!folderName || folderName.trim() === "") {
      throw ErrorFactory.InvalidRequest(
        "No folder configured in NEXT_PUBLIC_CLOUDINARY_FOLDER_NAME",
      );
    }

    // Double check we are not deleting root or something dangerous
    if (folderName === "/" || folderName === ".") {
      throw ErrorFactory.InvalidRequest("Cannot delete root folder");
    }

    // Delete all resources with the prefix (folder name)
    // Note: Cloudinary folders are just prefixes in public_ids
    const result = await cloudinaryInstance.v2.api.delete_resources_by_prefix(
      folderName,
      {
        type: "upload",
        resource_type: "image",
      },
    );

    // Also attempt to delete the empty folder itself (optional, might fail if not empty or not supported)
    // We ignore error here as the main goal is just cleaning images
    try {
      await cloudinaryInstance.v2.api.delete_folder(folderName);
    } catch (e) {
      console.log("Folder deletion skipped or failed (non-critical):", e);
    }

    return NextResponse.json(
      {
        message: "Cleanup successful",
        deletedKeys: result.deleted,
        folder: folderName,
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    return handleErrorResponse(error, "CLEANUP_IMAGES");
  }
}
