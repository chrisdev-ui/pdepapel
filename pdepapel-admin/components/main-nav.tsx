'use client'

import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'

export function MainNav({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  const pathname = usePathname()
  const params = useParams()
  const routes = [
    {
      href: `/${params.storeId}`,
      label: 'Inicio',
      active: pathname === `/${params.storeId}`
    },
    {
      href: `/${params.storeId}/billboards`,
      label: 'Publicaciones',
      active: pathname === `/${params.storeId}/billboards`
    },
    {
      href: `/${params.storeId}/banners`,
      label: 'Banners',
      active: pathname === `/${params.storeId}/banners`
    },
    {
      href: `/${params.storeId}/types`,
      label: 'Tipos',
      active: pathname === `/${params.storeId}/types`
    },
    {
      href: `/${params.storeId}/categories`,
      label: 'Categorias',
      active: pathname === `/${params.storeId}/categories`
    },
    {
      href: `/${params.storeId}/sizes`,
      label: 'Tamaños',
      active: pathname === `/${params.storeId}/sizes`
    },
    {
      href: `/${params.storeId}/colors`,
      label: 'Colores',
      active: pathname === `/${params.storeId}/colors`
    },
    {
      href: `/${params.storeId}/designs`,
      label: 'Diseños',
      active: pathname === `/${params.storeId}/designs`
    },
    {
      href: `/${params.storeId}/products`,
      label: 'Productos',
      active: pathname === `/${params.storeId}/products`
    },
    {
      href: `/${params.storeId}/orders`,
      label: 'Órdenes',
      active: pathname === `/${params.storeId}/orders`
    },
    {
      href: `/${params.storeId}/settings`,
      label: 'Ajustes',
      active: pathname === `/${params.storeId}/settings`
    }
  ]
  return (
    <nav className={cn('flex items-center space-x-4 lg:space-x-6', className)}>
      {routes.map((route) => (
        <Link
          key={route.href}
          href={route.href}
          className={cn(
            'text-sm  font-medium transition-colors hover:text-primary',
            {
              'text-black dark:text-white': route.active,
              'text-muted-foreground': !route.active
            }
          )}
        >
          {route.label}
        </Link>
      ))}
    </nav>
  )
}
