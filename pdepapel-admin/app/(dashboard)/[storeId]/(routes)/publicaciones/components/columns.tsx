"use client";

import { DataTableCellDate } from "@/components/ui/data-table-cell-date";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { Icons } from "@/components/ui/icons";
import { ColumnDef } from "@tanstack/react-table";
import { Facebook, Instagram, Twitter } from "lucide-react";
import { getPosts } from "../server/get-posts";
import { CellAction } from "./cell-action";

export type PostColumn = Awaited<ReturnType<typeof getPosts>>[number];

export const columns: ColumnDef<PostColumn>[] = [
  {
    accessorKey: "social",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Red Social" />
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-x-2">
        {row.original.social === "Facebook" && (
          <>
            <Facebook className="w-8" /> Facebook
          </>
        )}
        {row.original.social === "Instagram" && (
          <>
            <Instagram className="h-8 w-8" /> Instagram
          </>
        )}
        {row.original.social === "TikTok" && (
          <>
            <Icons.tiktok className="w-8" /> TikTok
          </>
        )}
        {row.original.social === "Twitter" && (
          <>
            <Twitter className="h-8 w-8" /> Twitter
          </>
        )}
      </div>
    ),
  },
  {
    accessorKey: "postId",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="ID de publicación" />
    ),
    cell: ({ row }) => <code>{row.original.postId}</code>,
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Fecha de creación" />
    ),
    cell: ({ row }) => <DataTableCellDate date={row.original.createdAt} />,
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
