"use client";

import { DataTableCellImage } from "@/components/ui/data-table-cell-image";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { Models } from "@/constants";
import { ColumnDef } from "@tanstack/react-table";
import { getBanners } from "../server/get-banners";
import { getMainBanner } from "../server/get-main-banner";
import { CellAction } from "./cell-action";

export type BannerColumn = Awaited<ReturnType<typeof getBanners>>[number];

export type MainBannerColumn = Awaited<
  ReturnType<typeof getMainBanner>
>[number];

export const bannerColumns: ColumnDef<BannerColumn>[] = [
  {
    accessorKey: "imageUrl",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Imagen" />
    ),
    cell: ({ row }) => (
      <DataTableCellImage
        className="w-24"
        src={row.original.imageUrl}
        alt={row.original.id}
        ratio={16 / 9}
      />
    ),
  },
  {
    accessorKey: "callToAction",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="URL de redirección" />
    ),
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Fecha de creación" />
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <CellAction source={Models.Banners} data={row.original} />
    ),
  },
];

export const mainBannerColumns: ColumnDef<MainBannerColumn>[] = [
  {
    accessorKey: "imageUrl",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Imagen" />
    ),
    cell: ({ row }) => (
      <DataTableCellImage
        className="w-24"
        src={row.original.imageUrl}
        alt={row.original.id}
        ratio={16 / 9}
      />
    ),
  },
  {
    accessorKey: "title",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Título" />
    ),
  },
  {
    accessorKey: "label1",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Párrafo 1" />
    ),
  },
  {
    accessorKey: "highlight",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Subrayado" />
    ),
  },
  {
    accessorKey: "label2",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Párrafo 2" />
    ),
  },
  {
    accessorKey: "callToAction",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="URL de redirección" />
    ),
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Fecha de creación" />
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <CellAction source={Models.MainBanner} data={row.original} />
    ),
  },
];
