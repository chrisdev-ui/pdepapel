'use client'

import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { ColumnDef } from '@tanstack/react-table'
import { CellAction } from './cell-action'

export type BannerColumn = {
  id: string
  imageUrl: string
  callToAction: string
  createdAt: string
}

export type MainBannerColumn = {
  id: string
  title: string
  label1: string
  highlight: string
  label2: string
  imageUrl: string
  callToAction: string
  createdAt: string
}

export const bannerColumns: ColumnDef<BannerColumn>[] = [
  {
    accessorKey: 'callToAction',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="URL de redirección" />
    )
  },
  {
    accessorKey: 'imageUrl',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Dirección de la imágen" />
    )
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Fecha de creación" />
    )
  },
  {
    id: 'actions',
    cell: ({ row }) => <CellAction source="banners" data={row.original} />
  }
]

export const mainBannerColumns: ColumnDef<MainBannerColumn>[] = [
  {
    accessorKey: 'title',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Título" />
    )
  },
  {
    accessorKey: 'label1',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Párrafo 1" />
    )
  },
  {
    accessorKey: 'highlight',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Subrayado" />
    )
  },
  {
    accessorKey: 'label2',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Párrafo 2" />
    )
  },
  {
    accessorKey: 'callToAction',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="URL de redirección" />
    )
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Fecha de creación" />
    )
  },
  {
    id: 'actions',
    cell: ({ row }) => <CellAction source="mainBanner" data={row.original} />
  }
]
