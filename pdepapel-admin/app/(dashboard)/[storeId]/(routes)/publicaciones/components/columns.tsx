"use client";

import { DataTableCellDate } from "@/components/ui/data-table-cell-date";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { SocialNetworkIcons } from "@/components/ui/social-network-icons";
import {
  buildSocialPostUrl,
  isSupportedSocial,
  SOCIAL_LABELS,
} from "@/lib/social-posts";
import { Social } from "@prisma/client";
import { ColumnDef } from "@tanstack/react-table";
import { ExternalLink, LucideProps } from "lucide-react";
import { getPosts } from "../server/get-posts";
import { CellAction } from "./cell-action";

export type PostColumn = Awaited<ReturnType<typeof getPosts>>[number];

const SOCIAL_ICONS: Record<Social, (props: LucideProps) => JSX.Element> = {
  Facebook: SocialNetworkIcons.facebook,
  Instagram: SocialNetworkIcons.instagram,
  TikTok: SocialNetworkIcons.tiktok,
  Youtube: SocialNetworkIcons.youtube,
  Pinterest: SocialNetworkIcons.pinterest,
  Twitter: SocialNetworkIcons.twitter,
};

export function SocialNetworkCell({ social }: { social: Social }) {
  const Icon = SOCIAL_ICONS[social];
  const supported = isSupportedSocial(social);
  return (
    <div className="flex items-center gap-x-2">
      {Icon && <Icon className="h-6 w-6 shrink-0" aria-hidden="true" />}
      <span className="flex flex-col leading-tight">
        <span>{SOCIAL_LABELS[social] ?? social}</span>
        {!supported && (
          <span className="text-xs text-muted-foreground">
            Ya no se muestra en la tienda
          </span>
        )}
      </span>
    </div>
  );
}

export const columns: ColumnDef<PostColumn>[] = [
  {
    accessorKey: "social",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Red social" />
    ),
    cell: ({ row }) => <SocialNetworkCell social={row.original.social} />,
  },
  {
    accessorKey: "postId",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Identificador" />
    ),
    cell: ({ row }) => (
      <span className="flex items-center gap-2">
        <code className="text-xs">{row.original.postId}</code>
        <a
          href={buildSocialPostUrl(row.original.social, row.original.postId)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="text-muted-foreground hover:text-primary"
          aria-label={`Ver publicación en ${SOCIAL_LABELS[row.original.social] ?? row.original.social}`}
          title="Ver publicación"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </span>
    ),
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
