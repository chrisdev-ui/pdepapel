'use client'

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
    header: 'URL de redirección'
  },
  {
    accessorKey: 'imageUrl',
    header: 'Dirección de la imagen'
  },
  {
    accessorKey: 'createdAt',
    header: 'Fecha de creación'
  },
  {
    id: 'actions',
    cell: ({ row }) => <CellAction source="banners" data={row.original} />
  }
]

export const mainBannerColumns: ColumnDef<MainBannerColumn>[] = [
  {
    accessorKey: 'title',
    header: 'Título'
  },
  {
    accessorKey: 'label1',
    header: 'Párrafo 1'
  },
  {
    accessorKey: 'highlight',
    header: 'Subrayado'
  },
  {
    accessorKey: 'label2',
    header: 'Párrafo 2'
  },
  {
    accessorKey: 'callToAction',
    header: 'URL de redirección'
  },
  {
    accessorKey: 'imageUrl',
    header: 'Dirección de la imagen'
  },
  {
    accessorKey: 'createdAt',
    header: 'Fecha de creación'
  },
  {
    id: 'actions',
    cell: ({ row }) => <CellAction source="mainBanner" data={row.original} />
  }
]
